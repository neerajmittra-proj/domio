import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { normalizeLedgerAmount, parseLedgerEntryInput } from '@/lib/ledger';
import { resolveTenancyLedgerAccess } from '@/lib/ledger-access';
import { loadActor, recordAudit } from '@/lib/audit';

const ENTRY_SELECT = {
  id: true,
  tenancyId: true,
  type: true,
  amount: true,
  date: true,
  rentFor: true,
  description: true,
} as const;

// Load the entry and make sure it belongs to the tenancy in the URL (and
// therefore to the caller's owner scope) — never trust the entry id alone.
async function loadEntry(tenancyId: string, entryId: string) {
  const entry = await prisma.ledgerEntry.findUnique({
    where: { id: entryId },
    select: ENTRY_SELECT,
  });
  if (!entry || entry.tenancyId !== tenancyId) return null;
  return entry;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenancyId: string; entryId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { tenancyId, entryId } = await params;
  const access = await resolveTenancyLedgerAccess(session.user, tenancyId, 'write');
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const entry = await loadEntry(tenancyId, entryId);
  if (!entry) {
    return NextResponse.json({ error: 'Ledger entry not found.' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const reason = typeof body.reason === 'string' ? body.reason : undefined;
  const parsed = parseLedgerEntryInput(body, {
    partial: true,
    existingType: entry.type,
  });
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const data = { ...parsed.data };
  // Type changed without a new amount: re-sign the stored amount for the new type.
  if (data.type && data.amount === undefined) {
    data.amount = normalizeLedgerAmount(data.type, entry.amount);
  }

  try {
    const actor = await loadActor(session.user.id);
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.ledgerEntry.update({
        where: { id: entryId },
        data: { ...data, updatedById: actor.id },
        select: ENTRY_SELECT,
      });
      await recordAudit(tx, {
        entity: 'LEDGER_ENTRY',
        entityId: entryId,
        action: 'UPDATE',
        actor,
        ctx: {
          ownerId: access.tenancy.ownerId,
          subPropertyId: access.tenancy.subPropertyId,
          rentableEntityId: access.tenancy.rentableEntityId,
          tenancyId,
        },
        before: entry,
        after: row,
        reason,
      });
      return row;
    });
    return NextResponse.json({ entry: updated });
  } catch (err) {
    console.error('Failed to update ledger entry:', err);
    return NextResponse.json(
      { error: 'Failed to save changes. Please try again.' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ tenancyId: string; entryId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { tenancyId, entryId } = await params;
  const access = await resolveTenancyLedgerAccess(session.user, tenancyId, 'write');
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const entry = await loadEntry(tenancyId, entryId);
  if (!entry) {
    return NextResponse.json({ error: 'Ledger entry not found.' }, { status: 404 });
  }

  try {
    const actor = await loadActor(session.user.id);
    await prisma.$transaction(async (tx) => {
      await tx.ledgerEntry.delete({ where: { id: entryId } });
      await recordAudit(tx, {
        entity: 'LEDGER_ENTRY',
        entityId: entryId,
        action: 'DELETE',
        actor,
        ctx: {
          ownerId: access.tenancy.ownerId,
          subPropertyId: access.tenancy.subPropertyId,
          rentableEntityId: access.tenancy.rentableEntityId,
          tenancyId,
        },
        before: entry,
        after: null,
      });
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Failed to delete ledger entry:', err);
    return NextResponse.json(
      { error: 'Failed to delete entry. Please try again.' },
      { status: 500 },
    );
  }
}
