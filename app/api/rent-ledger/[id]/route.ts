import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { resolveDataScope, resolveRentLedgerAccess } from '@/lib/manager-access';
import {
  RENT_LEDGER_MUTABLE_SELECT,
  computeRentStatus,
  mirrorRentPaymentToJournal,
  parseRentLedgerPatch,
} from '@/lib/rent-ledger';
import { loadActor, recordAudit } from '@/lib/audit';

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

  const entry = await prisma.rentLedger.findUnique({
    where: { id },
    select: RENT_LEDGER_MUTABLE_SELECT,
  });
  if (!entry || entry.ownerId !== ds.ownerId) {
    return NextResponse.json({ error: 'Rent ledger entry not found.' }, { status: 404 });
  }

  const access = await resolveRentLedgerAccess(session.user, {
    subPropertyId: entry.tenancy.subPropertyId,
  });
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const reason = typeof body.reason === 'string' ? body.reason : undefined;
  const parsed = parseRentLedgerPatch(body);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const merged = {
    dueDate: parsed.data.dueDate ?? entry.dueDate,
    amountDue: parsed.data.amountDue ?? entry.amountDue,
    amountPaid: parsed.data.amountPaid ?? entry.amountPaid,
    paidDate:
      parsed.data.paidDate !== undefined ? parsed.data.paidDate : entry.paidDate,
    rentFor: parsed.data.rentFor !== undefined ? parsed.data.rentFor : entry.rentFor,
    reference:
      parsed.data.reference !== undefined ? parsed.data.reference : entry.reference,
    notes: parsed.data.notes !== undefined ? parsed.data.notes : entry.notes,
    paymentMethod:
      parsed.data.paymentMethod !== undefined
        ? parsed.data.paymentMethod
        : entry.paymentMethod,
    // Status is always derived from the amounts + due date. An explicit status
    // from the client is ignored: it could contradict the amounts (e.g. PAID
    // with nothing paid) and corrupt arrears and collection figures.
    status: computeRentStatus({
      amountDue: parsed.data.amountDue ?? entry.amountDue,
      amountPaid: parsed.data.amountPaid ?? entry.amountPaid,
      dueDate: parsed.data.dueDate ?? entry.dueDate,
    }),
  };

  if (merged.amountPaid > merged.amountDue) {
    return NextResponse.json(
      { error: 'Amount paid cannot exceed the amount due.' },
      { status: 400 },
    );
  }

  try {
    const actor = await loadActor(session.user.id);
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.rentLedger.update({ where: { id }, data: merged });
      const ctx = {
        ownerId: ds.ownerId,
        subPropertyId: entry.tenancy.subPropertyId,
        rentableEntityId: entry.tenancy.rentableEntityId,
        tenancyId: entry.tenancyId,
      };
      await recordAudit(tx, {
        entity: 'RENT_LEDGER',
        entityId: id,
        action: 'UPDATE',
        actor,
        ctx,
        before: entry,
        after: row,
        reason,
      });
      // Keep the transaction journal in step when the paid total is edited.
      await mirrorRentPaymentToJournal(tx, {
        tenancyId: entry.tenancyId,
        previousPaid: entry.amountPaid,
        newPaid: merged.amountPaid,
        date: merged.paidDate ?? new Date(),
        rentFor: merged.rentFor,
        description: 'Rent record correction',
        actor,
        ctx,
      });
      return row;
    });
    return NextResponse.json({ entry: updated });
  } catch (err) {
    console.error('Failed to update rent ledger entry:', err);
    return NextResponse.json(
      { error: 'Failed to update entry. Please try again.' },
      { status: 500 },
    );
  }
}

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

  const entry = await prisma.rentLedger.findUnique({
    where: { id },
    select: RENT_LEDGER_MUTABLE_SELECT,
  });
  if (!entry || entry.ownerId !== ds.ownerId) {
    return NextResponse.json({ error: 'Rent ledger entry not found.' }, { status: 404 });
  }

  const access = await resolveRentLedgerAccess(session.user, {
    subPropertyId: entry.tenancy.subPropertyId,
  });
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const actor = await loadActor(session.user.id);
    await prisma.$transaction(async (tx) => {
      await tx.rentLedger.delete({ where: { id } });
      const ctx = {
        ownerId: ds.ownerId,
        subPropertyId: entry.tenancy.subPropertyId,
        rentableEntityId: entry.tenancy.rentableEntityId,
        tenancyId: entry.tenancyId,
      };
      await recordAudit(tx, {
        entity: 'RENT_LEDGER',
        entityId: id,
        action: 'DELETE',
        actor,
        ctx,
        before: entry,
        after: null,
      });
      // Reverse any payment already mirrored into the journal for this row.
      if (entry.amountPaid > 0) {
        await mirrorRentPaymentToJournal(tx, {
          tenancyId: entry.tenancyId,
          previousPaid: entry.amountPaid,
          newPaid: 0,
          date: new Date(),
          rentFor: entry.rentFor,
          description: 'Rent record deleted',
          actor,
          ctx,
        });
      }
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Failed to delete rent ledger entry:', err);
    return NextResponse.json(
      { error: 'Failed to delete entry. Please try again.' },
      { status: 500 },
    );
  }
}
