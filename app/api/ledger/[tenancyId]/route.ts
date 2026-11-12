import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { parseLedgerEntryInput, type ParsedLedgerEntry } from '@/lib/ledger';
import { resolveTenancyLedgerAccess } from '@/lib/ledger-access';
import { loadActor, recordAudit } from '@/lib/audit';

const ENTRY_SELECT = {
  id: true,
  type: true,
  amount: true,
  date: true,
  rentFor: true,
  description: true,
} as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenancyId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { tenancyId } = await params;
  const access = await resolveTenancyLedgerAccess(session.user, tenancyId, 'read');
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const entries = await prisma.ledgerEntry.findMany({
    where: { tenancyId },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    select: ENTRY_SELECT,
  });
  return NextResponse.json({ entries });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenancyId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { tenancyId } = await params;
  const access = await resolveTenancyLedgerAccess(session.user, tenancyId, 'write');
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = parseLedgerEntryInput(body, { partial: false });
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const d = parsed.data as ParsedLedgerEntry;

  try {
    const actor = await loadActor(session.user.id);
    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.ledgerEntry.create({
        data: {
          tenancyId,
          type: d.type,
          amount: d.amount,
          date: d.date,
          rentFor: d.rentFor ?? null,
          description: d.description,
          createdById: actor.id,
          updatedById: actor.id,
        },
        select: ENTRY_SELECT,
      });
      await recordAudit(tx, {
        entity: 'LEDGER_ENTRY',
        entityId: created.id,
        action: 'CREATE',
        actor,
        ctx: {
          ownerId: access.tenancy.ownerId,
          subPropertyId: access.tenancy.subPropertyId,
          rentableEntityId: access.tenancy.rentableEntityId,
          tenancyId,
        },
        before: null,
        after: created,
      });
      return created;
    });
    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    console.error('Failed to create ledger entry:', err);
    return NextResponse.json(
      { error: 'Failed to save entry. Please try again.' },
      { status: 500 },
    );
  }
}
