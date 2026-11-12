import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { resolveDataScope, resolveRentLedgerAccess } from '@/lib/manager-access';
import {
  RENT_LEDGER_MUTABLE_SELECT,
  computeRentStatus,
  mirrorRentPaymentToJournal,
  parsePaymentInput,
  round2,
} from '@/lib/rent-ledger';
import { loadActor, recordAudit } from '@/lib/audit';

class PaymentError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
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
  const parsed = parsePaymentInput(body);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const actor = await loadActor(session.user.id);
    const updated = await prisma.$transaction(async (tx) => {
      // Re-read inside the transaction so two concurrent payments can't both
      // be added to the same stale total (and the cap check sees the truth).
      const fresh = await tx.rentLedger.findUnique({
        where: { id },
        select: RENT_LEDGER_MUTABLE_SELECT,
      });
      if (!fresh || fresh.ownerId !== ds.ownerId) {
        throw new PaymentError('Rent ledger entry not found.', 404);
      }

      // Payments accumulate rather than replace — a partial payment followed by
      // another partial payment should add up, not overwrite.
      const outstanding = round2(fresh.amountDue - fresh.amountPaid);
      if (outstanding <= 0) {
        throw new PaymentError('This rent record is already fully paid.', 409);
      }
      if (parsed.data.amountPaid > outstanding) {
        throw new PaymentError(
          `Payment exceeds the outstanding balance of ${outstanding}.`,
          400,
        );
      }
      const newAmountPaid = round2(fresh.amountPaid + parsed.data.amountPaid);
      const status = computeRentStatus({
        amountDue: fresh.amountDue,
        amountPaid: newAmountPaid,
        dueDate: fresh.dueDate,
      });

      // Optimistic guard: only apply if nobody changed the paid total meanwhile.
      const res = await tx.rentLedger.updateMany({
        where: { id, amountPaid: fresh.amountPaid },
        data: {
          amountPaid: newAmountPaid,
          paidDate: parsed.data.paidDate,
          rentFor: parsed.data.rentFor,
          reference: parsed.data.reference,
          notes: parsed.data.notes,
          paymentMethod: parsed.data.paymentMethod,
          status,
        },
      });
      if (res.count === 0) {
        throw new PaymentError('This record was just updated. Please retry.', 409);
      }
      const row = await tx.rentLedger.findUniqueOrThrow({ where: { id } });

      const ctx = {
        ownerId: ds.ownerId,
        subPropertyId: fresh.tenancy.subPropertyId,
        rentableEntityId: fresh.tenancy.rentableEntityId,
        tenancyId: fresh.tenancyId,
      };
      await recordAudit(tx, {
        entity: 'RENT_LEDGER',
        entityId: id,
        action: 'UPDATE',
        actor,
        ctx,
        before: fresh,
        after: row,
        reason: 'Payment recorded',
      });
      await mirrorRentPaymentToJournal(tx, {
        tenancyId: fresh.tenancyId,
        previousPaid: fresh.amountPaid,
        newPaid: newAmountPaid,
        date: parsed.data.paidDate,
        rentFor: parsed.data.rentFor,
        description: parsed.data.reference
          ? `Rent payment (ref ${parsed.data.reference})`
          : 'Rent payment',
        actor,
        ctx,
      });
      return row;
    });
    return NextResponse.json({ entry: updated });
  } catch (err) {
    if (err instanceof PaymentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('Failed to record payment:', err);
    return NextResponse.json(
      { error: 'Failed to record payment. Please try again.' },
      { status: 500 },
    );
  }
}
