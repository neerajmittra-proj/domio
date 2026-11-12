import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { resolveDataScope } from '@/lib/manager-access';
import { handleMaintenanceStatusCascade } from '@/lib/rentable-entities';
import { deleteTenanciesCascade } from '@/lib/cascade-delete';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const ds = await resolveDataScope(session.user);

  if (ds.isManager) {
    return NextResponse.json(
      { error: 'Managers cannot delete rental entities.' },
      { status: 403 },
    );
  }

  try {
    const rentableEntity = await prisma.rentableEntity.findFirst({
      where: { id, ownerId: ds.ownerId },
      select: { id: true },
    });

    if (!rentableEntity) {
      return NextResponse.json(
        { error: 'Rental entity not found or unauthorized' },
        { status: 404 },
      );
    }

    // Single recursive query for the whole subtree (no per-level round-trips).
    const subtree = await prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE descendants AS (
        SELECT id
        FROM "RentableEntity"
        WHERE id = ${id} AND "ownerId" = ${ds.ownerId}
        UNION ALL
        SELECT re.id
        FROM "RentableEntity" re
        INNER JOIN descendants d ON re."parentId" = d.id
        WHERE re."ownerId" = ${ds.ownerId}
      )
      SELECT id FROM descendants
    `;
    const allIds = subtree.map((r) => r.id);

    await prisma.$transaction(async (tx) => {
      const allTenancies = await tx.tenancy.findMany({
        where: { rentableEntityId: { in: allIds } },
        select: { id: true },
      });
      await deleteTenanciesCascade(tx, allTenancies.map((t) => t.id));

      // One statement for the whole self-referencing subtree: Postgres checks
      // the FK at end-of-statement, so parent + children together is safe.
      await tx.rentableEntity.deleteMany({ where: { id: { in: allIds } } });
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('Error deleting rentable entity:', err);
    return NextResponse.json(
      { error: 'Failed to delete rental entity. Please try again.' },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const ds = await resolveDataScope(session.user);

  try {
    const existing = await prisma.rentableEntity.findFirst({
      where: { id, ownerId: ds.ownerId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Rental entity not found or unauthorized' },
        { status: 404 },
      );
    }

    if (ds.isManager) {
      if (!ds.scope.propertyIds.includes(existing.propertyId)) {
        return NextResponse.json(
          { error: 'Rental entity not found or unauthorized' },
          { status: 404 },
        );
      }
      if (!ds.scope.editPropertyIds.has(existing.propertyId)) {
        return NextResponse.json(
          { error: 'You have view-only access to this property.' },
          { status: 403 },
        );
      }
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const updates: {
      status?: 'OCCUPIED' | 'VACANT' | 'MAINTENANCE';
      rentAmount?: number;
      name?: string;
      code?: string;
      notes?: string | null;
      areaSqft?: number | null;
      sortOrder?: number | null;
    } = {};

    // A unit that has sub-units never carries its own status — occupied, vacant
    // and maintenance belong to the leaf units only.
    if (body.status !== undefined && body.status !== existing.status) {
      const childCount = await prisma.rentableEntity.count({ where: { parentId: id } });
      if (childCount > 0) {
        return NextResponse.json(
          {
            error: `"${existing.name}" has ${childCount} sub-unit${childCount !== 1 ? 's' : ''}, so it cannot be set to occupied, vacant or maintenance. Change the status of its sub-units instead.`,
          },
          { status: 400 },
        );
      }
    }

    if (body.status !== undefined) {
      if (['OCCUPIED', 'VACANT', 'MAINTENANCE'].includes(body.status)) {
        updates.status = body.status;
      } else {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
    }

    if (body.rentAmount !== undefined) {
      const rent = Number(body.rentAmount);
      if (!Number.isFinite(rent) || rent < 0) {
        return NextResponse.json({ error: 'Rent amount must be a non-negative number' }, { status: 400 });
      }
      updates.rentAmount = rent;
    }

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
      }
      updates.name = body.name.trim();
    }

    if (body.code !== undefined) {
      if (typeof body.code !== 'string' || !body.code.trim()) {
        return NextResponse.json({ error: 'Code cannot be empty' }, { status: 400 });
      }
      updates.code = body.code.trim();
    }

    if (body.notes !== undefined) {
      updates.notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;
    }

    if (body.areaSqft !== undefined) {
      if (body.areaSqft === null || body.areaSqft === '') {
        updates.areaSqft = null;
      } else {
        const area = Number(body.areaSqft);
        if (!Number.isFinite(area) || area < 0) {
          return NextResponse.json({ error: 'Area must be a non-negative number' }, { status: 400 });
        }
        updates.areaSqft = area;
      }
    }

    if (body.sortOrder !== undefined) {
      if (body.sortOrder === null || body.sortOrder === '') {
        updates.sortOrder = null;
      } else {
        const order = Number(body.sortOrder);
        if (Number.isInteger(order)) {
          updates.sortOrder = order;
        }
      }
    }

    const updatedEntity = await prisma.rentableEntity.update({
      where: { id },
      data: updates,
    });

    if (updates.status) {
      await handleMaintenanceStatusCascade(id, updates.status, ds.ownerId);

      // When a unit is set to MAINTENANCE, terminate active tenancies on all
      // descendant sub-units so that internal rent/collection calculations stay
      // consistent (no active rent should accrue for units under maintenance).
      if (updates.status === 'MAINTENANCE') {
        const descendantIds = await prisma.$queryRaw<{ id: string }[]>`
          WITH RECURSIVE descendants AS (
            SELECT id
            FROM "RentableEntity"
            WHERE id = ${id} AND "ownerId" = ${ds.ownerId}
            UNION ALL
            SELECT re.id
            FROM "RentableEntity" re
            INNER JOIN descendants d ON re."parentId" = d.id
            WHERE re."ownerId" = ${ds.ownerId}
          )
          SELECT id FROM descendants WHERE id != ${id}
        `;
        const descIds = descendantIds.map((r) => r.id);
        if (descIds.length > 0) {
          // Terminate active tenancies on all descendant entities
          await prisma.tenancy.updateMany({
            where: {
              rentableEntityId: { in: descIds },
              status: 'ACTIVE',
            },
            data: { status: 'TERMINATED' },
          });
        }
      }
    }

    // Also sync updates to any dual-synced SubProperty matching this entity
    const matchingSubProp = await prisma.subProperty.findFirst({
      where: {
        propertyId: existing.propertyId,
        ownerId: ds.ownerId,
        OR: [
          { unitNumber: existing.code },
          { name: existing.name },
        ],
      },
    });

    if (matchingSubProp) {
      await prisma.subProperty.update({
        where: { id: matchingSubProp.id },
        data: {
          ...(updates.name ? { name: updates.name } : {}),
          ...(updates.code ? { unitNumber: updates.code } : {}),
          ...(updates.rentAmount !== undefined ? { rentAmount: updates.rentAmount } : {}),
          ...(updates.status ? { status: updates.status } : {}),
          ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
          ...(updates.areaSqft !== undefined ? { areaSqft: updates.areaSqft } : {}),
        },
      }).catch((err) => {
        console.warn('Matching SubProperty sync warning:', err);
      });
    }

    return NextResponse.json({ entity: updatedEntity });
  } catch (err: unknown) {
    console.error('Error updating rentable entity:', err);
    return NextResponse.json(
      { error: 'Failed to update rental entity. Please try again.' },
      { status: 500 },
    );
  }
}