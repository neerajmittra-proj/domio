import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { resolveDataScope } from '@/lib/manager-access';
import { generateTenancyId } from '@/lib/display-ids';
import {
  checkAncestorLeaseConflict,
  checkDescendantLeaseConflict,
} from '@/lib/rentable-entities';
import { buildLedgerSchedule, computeRentStatus } from '@/lib/rent-ledger';
import { notifyInBackground, notifyTenantAssigned } from '@/lib/tenant-notifications';

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isSuperAdmin = session.user.role === 'SUPER_ADMIN';
    const ds = await resolveDataScope(session.user);
    const body = await req.json().catch(() => ({}));

    const {
      tenantId,
      subPropertyId,
      rentableEntityId,
      startDate,
      endDate,
      monthlyRent,
      securityDeposit,
      paymentDayOfMonth,
    } = body;

    // ── Basic validation ───────────────────────────────────────────────────
    if (!tenantId || typeof tenantId !== 'string') {
      return NextResponse.json({ error: 'Tenant ID is required.' }, { status: 400 });
    }

    if (!subPropertyId && !rentableEntityId) {
      return NextResponse.json(
        { error: 'Please select a unit or property to assign.' },
        { status: 400 },
      );
    }

    const start = startDate ? new Date(startDate as string) : null;
    const end = endDate ? new Date(endDate as string) : null;
    if (!start || Number.isNaN(start.getTime())) {
      return NextResponse.json({ error: 'Valid start date is required.' }, { status: 400 });
    }
    if (!end || Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: 'Valid end date is required.' }, { status: 400 });
    }
    if (end <= start) {
      return NextResponse.json({ error: 'End date must be after start date.' }, { status: 400 });
    }

    const rent = Number(monthlyRent);
    if (!Number.isFinite(rent) || rent < 0) {
      return NextResponse.json({ error: 'Valid monthly rent is required.' }, { status: 400 });
    }

    const deposit =
      securityDeposit !== undefined && securityDeposit !== null && securityDeposit !== ''
        ? Number(securityDeposit)
        : 0;
    if (!Number.isFinite(deposit) || deposit < 0) {
      return NextResponse.json(
        { error: 'Security deposit must be a non-negative number.' },
        { status: 400 },
      );
    }
    const dayRaw =
      paymentDayOfMonth !== undefined && paymentDayOfMonth !== null && paymentDayOfMonth !== ''
        ? Number(paymentDayOfMonth)
        : 1;
    if (!Number.isFinite(dayRaw)) {
      return NextResponse.json(
        { error: 'Payment day must be a number between 1 and 28.' },
        { status: 400 },
      );
    }
    const day = Math.min(28, Math.max(1, Math.trunc(dayRaw)));

    // ── Verify tenant exists ───────────────────────────────────────────────
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, ownerId: true },
    });
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 });
    }

    // targetOwnerId = the unit's actual owner (who we will link the tenancy to)
    let targetOwnerId: string = ds.ownerId;

    // ── Standard SubProperty unit ──────────────────────────────────────────
    if (subPropertyId) {
      const unit = await prisma.subProperty.findUnique({
        where: { id: subPropertyId },
        include: { property: { select: { ownerId: true } } },
      });

      if (!unit) {
        return NextResponse.json({ error: 'Unit not found.' }, { status: 404 });
      }

      // Access check: SUPER_ADMIN can assign any unit; OWNER must own it
      if (!isSuperAdmin && unit.property.ownerId !== ds.ownerId && unit.property.ownerId !== session.user.id) {
        return NextResponse.json(
          { error: `Access denied: this unit belongs to a different owner (unit owner: ${unit.property.ownerId}, you: ${ds.ownerId}).` },
          { status: 403 },
        );
      }

      // Managers need EDIT access to the unit (404 when it is out of scope).
      if (ds.isManager) {
        if (!ds.scope.subPropertyIds.includes(subPropertyId)) {
          return NextResponse.json({ error: 'Unit not found.' }, { status: 404 });
        }
        if (!ds.scope.editSubPropertyIds.has(subPropertyId)) {
          return NextResponse.json(
            { error: 'You have view-only access to this unit.' },
            { status: 403 },
          );
        }
      }

      if (unit.status === 'MAINTENANCE') {
        return NextResponse.json(
          { error: 'This unit is under maintenance and cannot be leased. Set it to Vacant first.' },
          { status: 400 },
        );
      }

      targetOwnerId = unit.property.ownerId;

      // Check for overlapping active lease on this unit (any tenant)
      const existingLease = await prisma.tenancy.findFirst({
        where: {
          subPropertyId,
          status: 'ACTIVE',
          startDate: { lte: end },
          endDate: { gte: start },
        },
      });
      if (existingLease) {
        return NextResponse.json(
          { error: 'This unit already has an active lease for the selected period.' },
          { status: 400 },
        );
      }

      // Check: this tenant must not already have an active lease on the same unit
      const tenantUnitDuplicate = await prisma.tenancy.findFirst({
        where: {
          tenantId,
          subPropertyId,
          status: 'ACTIVE',
        },
      });
      if (tenantUnitDuplicate) {
        return NextResponse.json(
          { error: 'This tenant already has an active lease on this unit.' },
          { status: 400 },
        );
      }
    }

    // ── Hierarchical RentableEntity (Building/Floor/Room/Bed) ────────────
    if (rentableEntityId) {
      const entity = await prisma.rentableEntity.findUnique({
        where: { id: rentableEntityId },
        select: {
          id: true,
          ownerId: true,
          propertyId: true,
          status: true,
          name: true,
          type: true,
          children: { select: { id: true, name: true, type: true } },
        },
      });

      if (!entity) {
        return NextResponse.json({ error: 'Rental entity not found.' }, { status: 404 });
      }

      // Access first (don't leak structure of other owners' entities), then rules.
      if (!isSuperAdmin && entity.ownerId !== ds.ownerId && entity.ownerId !== session.user.id) {
        return NextResponse.json(
          { error: 'Access denied: this entity belongs to a different owner.' },
          { status: 403 },
        );
      }
      if (ds.isManager) {
        if (!ds.scope.propertyIds.includes(entity.propertyId)) {
          return NextResponse.json({ error: 'Rental entity not found.' }, { status: 404 });
        }
        if (!ds.scope.editPropertyIds.has(entity.propertyId)) {
          return NextResponse.json(
            { error: 'You have view-only access to this property.' },
            { status: 403 },
          );
        }
      }
      if (entity.status === 'MAINTENANCE') {
        return NextResponse.json(
          { error: `"${entity.name}" is under maintenance and cannot be leased. Set it to Vacant first.` },
          { status: 400 },
        );
      }

      // STRICT RULE: If entity has child sub-units (e.g. rooms under a floor, beds under a room),
      // tenants can only be assigned to leaf sub-units (e.g. bed), never to the upper/parent unit.
      if (entity.children.length > 0) {
        return NextResponse.json(
          {
            error: `Cannot assign a tenant to "${entity.name}" (${entity.type}) because it contains ${entity.children.length} sub-unit(s). Tenants can only be assigned directly to leaf units (e.g., individual beds or standalone rooms).`,
          },
          { status: 400 },
        );
      }

      if (!isSuperAdmin && entity.ownerId !== ds.ownerId && entity.ownerId !== session.user.id) {
        return NextResponse.json(
          { error: `Access denied: this entity belongs to a different owner (entity owner: ${entity.ownerId}, you: ${ds.ownerId}).` },
          { status: 403 },
        );
      }

      targetOwnerId = entity.ownerId;

      // Enforce Ancestor Conflict: Cannot lease sub-unit if parent floor/building is leased
      try {
        const ancestorConflict = await checkAncestorLeaseConflict(rentableEntityId, start, end);
        if (ancestorConflict) {
          return NextResponse.json(
            {
              error:
                'Cannot lease this unit because its parent floor/building already has an active lease for this period.',
            },
            { status: 400 },
          );
        }
      } catch (e) {
        console.warn('[POST /api/tenancies] Ancestor conflict check skipped:', e);
      }

      // Enforce Descendant Conflict: Cannot lease floor/building if any child room/bed is leased
      try {
        const descendantConflict = await checkDescendantLeaseConflict(rentableEntityId, start, end);
        if (descendantConflict) {
          return NextResponse.json(
            {
              error:
                'Cannot lease this entire floor/unit because one or more of its sub-units/beds already have active leases.',
            },
            { status: 400 },
          );
        }
      } catch (e) {
        console.warn('[POST /api/tenancies] Descendant conflict check skipped:', e);
      }

      // Check: this tenant must not already have an active lease on the same rentable entity
      const tenantEntityDuplicate = await prisma.tenancy.findFirst({
        where: {
          tenantId,
          rentableEntityId,
          status: 'ACTIVE',
        },
      });
      if (tenantEntityDuplicate) {
        return NextResponse.json(
          { error: 'This tenant already has an active lease on this unit.' },
          { status: 400 },
        );
      }
    }

    // Guard against cross-owner tenant hijack: a caller could otherwise point
    // a tenancy at their own unit using a tenantId belonging to a tenant
    // already linked to a *different* owner, silently reassigning that
    // tenant's ownerId (see Tenant.ownerId -- "null until linked to an
    // owner"). Only unclaimed tenants (ownerId null) or tenants already
    // owned by the unit's owner may be assigned; SUPER_ADMIN is exempt.
    if (!isSuperAdmin && tenant.ownerId && tenant.ownerId !== targetOwnerId) {
      return NextResponse.json(
        { error: 'Access denied: this tenant record belongs to a different owner.' },
        { status: 403 },
      );
    }

    // -- Create tenancy + update statuses atomically ------------------------
    // Everything below (tenancy row, rent schedule, unit/entity status flip,
    // tenant ownerId link) is one unit of work: if any step fails, nothing
    // should stick -- a bare sequence of awaits previously left the tenancy
    // created but e.g. the unit still VACANT on a rent-schedule failure.
    const displayId = await generateTenancyId().catch(() => null);
    const schedule = buildLedgerSchedule(start, end, day, rent);

    const tenancy = await prisma.$transaction(async (tx) => {
      const created = await tx.tenancy.create({
        data: {
          displayId,
          tenantId,
          subPropertyId: subPropertyId || null,
          rentableEntityId: rentableEntityId || null,
          startDate: start,
          endDate: end,
          monthlyRent: rent,
          securityDeposit: deposit,
          paymentDayOfMonth: day,
          status: 'ACTIVE',
          ownerId: targetOwnerId,
        },
      });

      // Pre-generate monthly rent schedules for the full lease duration
      if (schedule.length > 0) {
        await tx.rentLedger.createMany({
          data: schedule.map((item) => ({
            tenancyId: created.id,
            ownerId: targetOwnerId,
            dueDate: item.dueDate,
            amountDue: item.amountDue,
            amountPaid: 0,
            status: computeRentStatus({
              amountDue: item.amountDue,
              amountPaid: 0,
              dueDate: item.dueDate,
            }),
          })),
        });
      }

      // Mark unit/entity as OCCUPIED
      if (subPropertyId) {
        await tx.subProperty.update({
          where: { id: subPropertyId },
          data: { status: 'OCCUPIED' },
        });
      }
      if (rentableEntityId) {
        await tx.rentableEntity.update({
          where: { id: rentableEntityId },
          data: { status: 'OCCUPIED' },
        });
      }

      // Always link tenant to the unit's owner
      await tx.tenant.update({
        where: { id: tenantId },
        data: { ownerId: targetOwnerId },
      });

      return created;
    });

    // Welcome email + SMS to the tenant with rent, due day and unit.
    notifyInBackground('welcome', () => notifyTenantAssigned(tenancy.id));

    return NextResponse.json({ success: true, tenancyId: tenancy.id }, { status: 201 });
  } catch (error: any) {
    console.error('[POST /api/tenancies] Unhandled error:', error?.message ?? error);
    return NextResponse.json(
      { error: error?.message || 'Failed to create tenancy' },
      { status: 500 },
    );
  }
}
