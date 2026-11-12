import { NextResponse } from 'next/server';
import type { BillStatus } from '@prisma/client';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { resolveDataScope, resolveEditAccess } from '@/lib/manager-access';
import { parseBillPaymentInput } from '@/lib/utilities';

class BillPaymentError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function computeStatus(amount: number, amountPaid: number, dueDate: Date): BillStatus {
  if (amountPaid >= amount && amount > 0) return 'PAID';
  if (amountPaid > 0) return 'PARTIAL';
  return dueDate < new Date() ? 'OVERDUE' : 'UNPAID';
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

  const full = await prisma.utilityBill.findUnique({
    where: { id },
    select: {
      ownerId: true,
      amount: true,
      amountPaid: true,
      dueDate: true,
      utilityAccount: { select: { propertyId: true, subPropertyId: true } },
    },
  });
  if (!full || full.ownerId !== ds.ownerId) {
    return NextResponse.json({ error: 'Utility bill not found.' }, { status: 404 });
  }

  if (ds.isManager) {
    const access = await resolveEditAccess(session.user, {
      propertyId: full.utilityAccount.propertyId,
      subPropertyId: full.utilityAccount.subPropertyId,
    });
    if ('error' in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = parseBillPaymentInput(body);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      // Re-read inside the transaction: the cap and the running total must be
      // computed from the current row, not the one read before the body parse.
      const fresh = await tx.utilityBill.findUnique({
        where: { id },
        select: { ownerId: true, amount: true, amountPaid: true, dueDate: true },
      });
      if (!fresh || fresh.ownerId !== ds.ownerId) {
        throw new BillPaymentError('Utility bill not found.', 404);
      }
      const outstanding = round2(fresh.amount - fresh.amountPaid);
      if (outstanding <= 0) {
        throw new BillPaymentError('This bill is already fully paid.', 409);
      }
      if (parsed.data.amountPaid > outstanding) {
        throw new BillPaymentError(
          `Payment exceeds the outstanding balance of ${outstanding}.`,
          400,
        );
      }
      const newAmountPaid = round2(fresh.amountPaid + parsed.data.amountPaid);
      const status = computeStatus(fresh.amount, newAmountPaid, fresh.dueDate);
      const res = await tx.utilityBill.updateMany({
        where: { id, amountPaid: fresh.amountPaid },
        data: {
          amountPaid: newAmountPaid,
          paidDate: parsed.data.paidDate,
          paymentMethod: parsed.data.paymentMethod,
          status,
        },
      });
      if (res.count === 0) {
        throw new BillPaymentError('This bill was just updated. Please retry.', 409);
      }
      return tx.utilityBill.findUniqueOrThrow({ where: { id } });
    });
    return NextResponse.json({ bill: updated });
  } catch (err) {
    if (err instanceof BillPaymentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('Failed to record bill payment:', err);
    return NextResponse.json(
      { error: 'Failed to record payment. Please try again.' },
      { status: 500 },
    );
  }
}
