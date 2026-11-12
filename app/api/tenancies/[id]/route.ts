import { NextResponse } from 'next/server';
import type { Prisma, TenancyStatus } from '@prisma/client';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { resolveDataScope, type DataScope } from '@/lib/manager-access';
import {
  cascadeVacantToDescendants,
  checkAncestorLeaseConflict,
  checkDescendantLeaseConflict,
} from '@/lib/rentable-entities';
import { buildLedgerSchedule, computeRentStatus } from '@/lib/rent-ledger';
import { deleteTenanciesCascade } from '@/lib/cascade-delete';

const VALID_STATUSES: TenancyStatus[] = ['ACTIVE', 'EXPIRED', 'TERMINATED'];

type TenancyScopeRow = {
  subPropertyId: string | null;
  rentableEntity: { propertyId: string } | null;
};

// Managers need EDIT access to the unit (or, for hierarchy entities, to the
// parent property). Returns an error Response, or null when allowed.
function managerDenied(ds: DataScope, t: TenancyScopeRow): NextResponse | null {
  if (!ds.isManager) return null;
  if (t.subPropertyId) {
    if (!ds.scope.subPropertyIds.includes(t.subPropertyId)) {
      return NextResponse.json({ error: 'Tenancy not found or access denied.' }, { status: 404 });
    }
    if (!ds.scope.editSubPropertyIds.has(t.subPropertyId)) {
      return NextResponse.json({ error: 'You have view-only access to this unit.' }, { status: 403 });
    }
    return null;
  }
  const propertyId = t.rentableEntity?.propertyId;
  if (!propertyId || !ds.scope.propertyIds.includes(propertyId)) {
    return NextResponse.json({ error: 'Tenancy not found or access denied.' }, { status: 404 });
  }
  if (!ds.scope.editPropertyIds.has(propertyId)) {
    return NextResponse.json({ error: 'You have view-only access to this property.' }, { status: 403 });
  }
  return null;
}

// Set the unit/entity back to VACANT when no other ACTIVE lease remains on it.
// Returns the entity id that went vacant (for the descendant cascade, which
// runs outside the transaction as a raw statement).
async function vacateIfFree(
  tx: Prisma.TransactionClient,
  tenancy: { id: string; subPropertyId: string | null; rentableEntityId: string | null },
): Promise<string | null> {
  if (tenancy.subPropertyId) {
    const remaining = await tx.tenancy.findFirst({
      where: { subPropertyId: tenancy.subPropertyId, status: 'ACTIVE', id: { not: tenancy.id } },
      select: { id: true },
    });
    if (!remaining) {
      await tx.subProperty.update({
        where: { id: tenancy.subPropertyId },
        data: { status: 'VACANT' },
      });
    }
  }
  if (tenancy.rentableEntityId) {
    const remaining = await tx.tenancy.findFirst({
      where: { rentableEntityId: tenancy.rentableEntityId, status: 'ACTIVE', id: { not: tenancy.id } },
      select: { id: true },
    });
    if (!remaining) {
      await tx.rentableEntity.update({
        where: { id: tenancy.rentableEntityId },
        data: { status: 'VACANT' },
      });
      return tenancy.rentableEntityId;
    }
  }
  return null;
}

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}`;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ds = await resolveDataScope(session.user);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const isSuperAdmin = session.user.role === 'SUPER_ADMIN';

    const tenancy = await prisma.tenancy.findUnique({
      where: { id },
      include: {
        subProperty: { select: { id: true, status: true } },
        rentableEntity: { select: { id: true, propertyId: true, status: true } },
      },
    });

    if (!tenancy || (!isSuperAdmin && tenancy.ownerId !== session.user.id && tenancy.ownerId !== ds.ownerId)) {
      return NextResponse.json({ error: 'Tenancy not found or access denied.' }, { status: 404 });
    }
    const denied = managerDenied(ds, tenancy);
    if (denied) return denied;

    const { monthlyRent, securityDeposit, startDate, endDate, paymentDayOfMonth } = body;
    let { status } = body as { status?: string };
    // Legacy clients sent "ENDED"; the enum value is TERMINATED.
    if (status === 'ENDED') status = 'TERMINATED';

    const data: Prisma.TenancyUpdateInput = {};

    if (status !== undefined && status !== null && status !== '') {
      if (!VALID_STATUSES.includes(status as TenancyStatus)) {
        return NextResponse.json({ error: 'Invalid tenancy status.' }, { status: 400 });
      }
      data.status = status as TenancyStatus;
    }

    let newRent = tenancy.monthlyRent;
    if (monthlyRent !== undefined) {
      const r = Number(monthlyRent);
      if (monthlyRent === '' || monthlyRent === null || !Number.isFinite(r) || r < 0) {
        return NextResponse.json({ error: 'Valid monthly rent is required.' }, { status: 400 });
      }
      newRent = r;
      data.monthlyRent = r;
    }
    if (securityDeposit !== undefined) {
      const d = Number(securityDeposit);
      if (securityDeposit === '' || securityDeposit === null || !Number.isFinite(d) || d < 0) {
        return NextResponse.json({ error: 'Security deposit must be a non-negative number.' }, { status: 400 });
      }
      data.securityDeposit = d;
    }
    let newDay = tenancy.paymentDayOfMonth;
    if (paymentDayOfMonth !== undefined) {
      const p = Number(paymentDayOfMonth);
      if (paymentDayOfMonth === '' || paymentDayOfMonth === null || !Number.isFinite(p)) {
        return NextResponse.json({ error: 'Payment day must be a number between 1 and 28.' }, { status: 400 });
      }
      newDay = Math.min(28, Math.max(1, Math.trunc(p)));
      data.paymentDayOfMonth = newDay;
    }
    let newStart = tenancy.startDate;
    if (startDate) {
      const s = new Date(startDate);
      if (Number.isNaN(s.getTime())) {
        return NextResponse.json({ error: 'Valid start date is required.' }, { status: 400 });
      }
      newStart = s;
      data.startDate = s;
    }
    let newEnd = tenancy.endDate;
    if (endDate) {
      const e = new Date(endDate);
      if (Number.isNaN(e.getTime())) {
        return NextResponse.json({ error: 'Valid end date is required.' }, { status: 400 });
      }
      newEnd = e;
      data.endDate = e;
    }
    if (newEnd <= newStart) {
      return NextResponse.json({ error: 'End date must be after start date.' }, { status: 400 });
    }

    const newStatus: TenancyStatus = (data.status as TenancyStatus | undefined) ?? tenancy.status;
    const reactivating = newStatus === 'ACTIVE' && tenancy.status !== 'ACTIVE';
    const wasOrIsActive = newStatus === 'ACTIVE';
    const windowChanged =
      wasOrIsActive &&
      (newStart.getTime() !== tenancy.startDate.getTime() ||
        newEnd.getTime() !== tenancy.endDate.getTime());

    // Reactivating a lease, or moving an active lease's dates, must not
    // create a double booking.
    if (reactivating || windowChanged) {
      if (tenancy.subPropertyId) {
        const clash = await prisma.tenancy.findFirst({
          where: {
            subPropertyId: tenancy.subPropertyId,
            status: 'ACTIVE',
            id: { not: id },
            startDate: { lte: newEnd },
            endDate: { gte: newStart },
          },
          select: { id: true },
        });
        if (clash) {
          return NextResponse.json(
            { error: 'This unit already has an active lease for the selected period.' },
            { status: 400 },
          );
        }
      }
      if (tenancy.rentableEntityId) {
        const clash = await prisma.tenancy.findFirst({
          where: {
            rentableEntityId: tenancy.rentableEntityId,
            status: 'ACTIVE',
            id: { not: id },
            startDate: { lte: newEnd },
            endDate: { gte: newStart },
          },
          select: { id: true },
        });
        const ancestor = await checkAncestorLeaseConflict(tenancy.rentableEntityId, newStart, newEnd);
        const descendant = await checkDescendantLeaseConflict(tenancy.rentableEntityId, newStart, newEnd);
        if (clash || ancestor || descendant) {
          return NextResponse.json(
            { error: 'This unit (or its parent/sub-units) already has an active lease for the selected period.' },
            { status: 400 },
          );
        }
      }
    }
    if (reactivating) {
      if (tenancy.subProperty?.status === 'MAINTENANCE' || tenancy.rentableEntity?.status === 'MAINTENANCE') {
        return NextResponse.json(
          { error: 'This unit is under maintenance and cannot be leased. Set it to Vacant first.' },
          { status: 400 },
        );
      }
    }

    const scheduleChanged =
      wasOrIsActive &&
      (newRent !== tenancy.monthlyRent ||
        newDay !== tenancy.paymentDayOfMonth ||
        newStart.getTime() !== tenancy.startDate.getTime() ||
        newEnd.getTime() !== tenancy.endDate.getTime() ||
        reactivating);
    const ending = newStatus !== 'ACTIVE' && data.status !== undefined;

    const { updated, vacatedEntityId } = await prisma.$transaction(async (tx) => {
      const updated = await tx.tenancy.update({ where: { id }, data });

      // Keep the pre-generated rent schedule in step with the lease terms:
      // untouched (unpaid, no payment/notes) rows are rebuilt; rows with any
      // payment history are preserved and their months are not duplicated.
      if (scheduleChanged) {
        const existing = await tx.rentLedger.findMany({
          where: { tenancyId: id },
          select: { id: true, dueDate: true, amountPaid: true, paidDate: true, notes: true, reference: true },
        });
        const keep = existing.filter(
          (r) => r.amountPaid > 0 || r.paidDate !== null || r.notes || r.reference,
        );
        const keepIds = new Set(keep.map((r) => r.id));
        const dropIds = existing.filter((r) => !keepIds.has(r.id)).map((r) => r.id);
        if (dropIds.length) {
          await tx.rentLedger.deleteMany({ where: { id: { in: dropIds } } });
        }
        const keptMonths = new Set(keep.map((r) => monthKey(r.dueDate)));
        const rows = buildLedgerSchedule(newStart, newEnd, newDay, newRent).filter(
          (item) => !keptMonths.has(monthKey(item.dueDate)),
        );
        if (rows.length) {
          await tx.rentLedger.createMany({
            data: rows.map((item) => ({
              tenancyId: id,
              ownerId: tenancy.ownerId,
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
      }

      let vacatedEntityId: string | null = null;
      if (newStatus === 'TERMINATED' && data.status !== undefined) {
        // Early termination: untouched future rent rows should not keep accruing.
        await tx.rentLedger.deleteMany({
          where: {
            tenancyId: id,
            dueDate: { gt: new Date() },
            amountPaid: 0,
            paidDate: null,
            notes: null,
            reference: null,
          },
        });
      }
      if (ending) {
        // Terminated / expired: free the unit if nothing else is active on it.
        vacatedEntityId = await vacateIfFree(tx, tenancy);
      } else if (reactivating) {
        if (tenancy.subPropertyId) {
          await tx.subProperty.update({ where: { id: tenancy.subPropertyId }, data: { status: 'OCCUPIED' } });
        }
        if (tenancy.rentableEntityId) {
          await tx.rentableEntity.update({ where: { id: tenancy.rentableEntityId }, data: { status: 'OCCUPIED' } });
        }
      }
      return { updated, vacatedEntityId };
    });

    if (vacatedEntityId) {
      // A parent unit going vacant means every sub-unit nested beneath it is
      // vacant too (sub-units with their own active lease are skipped).
      await cascadeVacantToDescendants(vacatedEntityId, tenancy.ownerId);
    }

    return NextResponse.json({ success: true, tenancy: updated });
  } catch (error: any) {
    console.error('[API tenancies/[id] PATCH] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update tenancy' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ds = await resolveDataScope(session.user);
    const { id } = await params;

    const isSuperAdmin = session.user.role === 'SUPER_ADMIN';

    const tenancy = await prisma.tenancy.findUnique({
      where: { id },
      include: { rentableEntity: { select: { propertyId: true } } },
    });

    if (!tenancy || (!isSuperAdmin && tenancy.ownerId !== session.user.id && tenancy.ownerId !== ds.ownerId)) {
      return NextResponse.json({ error: 'Tenancy not found or access denied.' }, { status: 404 });
    }
    const denied = managerDenied(ds, tenancy);
    if (denied) return denied;

    // RentLedger / LedgerEntry have no ON DELETE CASCADE, so a bare
    // tenancy.delete always failed once the schedule had been generated.
    // Delete dependants + tenancy + unit-status flip as one unit of work.
    const vacatedEntityId = await prisma.$transaction(async (tx) => {
      await deleteTenanciesCascade(tx, [id]);
      return vacateIfFree(tx, tenancy);
    });

    if (vacatedEntityId) {
      await cascadeVacantToDescendants(vacatedEntityId, tenancy.ownerId);
    }

    return NextResponse.json({ success: true, message: 'Tenancy deleted' });
  } catch (error: any) {
    console.error('[API tenancies/[id] DELETE] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to delete tenancy' },
      { status: 500 },
    );
  }
}
