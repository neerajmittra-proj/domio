import { prisma } from '@/lib/prisma';

// What each tenancy owes, read from the rent schedule (RentLedger).
// This is the single source of truth for "overdue" across the app: the Rent
// page, the dashboard, the tenant list and the portfolio cards all use it, so
// the same tenant can never show different arrears on different pages.
//   overdue   = unpaid balance on rows whose due date is before today
//   dueToDate = unpaid balance on rows due up to and including today
export type TenancyArrears = {
  tenancyId: string;
  overdue: number;
  dueToDate: number;
  overdueRows: number;
  oldestOverdueDate: Date | null;
  oldestOverdueEntryId: string | null;
};

const DAY_MS = 86_400_000;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export async function getArrearsByTenancy(
  ownerId: string,
  opts: { tenancyIds?: string[]; subPropertyIds?: string[] } = {},
): Promise<Map<string, TenancyArrears>> {
  const now = new Date();
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const tomorrow = new Date(todayStart + DAY_MS);

  const rows = await prisma.rentLedger.findMany({
    where: {
      ownerId,
      dueDate: { lt: tomorrow },
      status: { not: 'PAID' },
      ...(opts.tenancyIds ? { tenancyId: { in: opts.tenancyIds } } : {}),
      ...(opts.subPropertyIds ? { tenancy: { subPropertyId: { in: opts.subPropertyIds } } } : {}),
    },
    orderBy: { dueDate: 'asc' },
    select: { id: true, tenancyId: true, dueDate: true, amountDue: true, amountPaid: true },
  });

  const map = new Map<string, TenancyArrears>();
  for (const r of rows) {
    const owed = round2(r.amountDue - r.amountPaid);
    if (owed <= 0) continue;
    const cur =
      map.get(r.tenancyId) ??
      {
        tenancyId: r.tenancyId,
        overdue: 0,
        dueToDate: 0,
        overdueRows: 0,
        oldestOverdueDate: null,
        oldestOverdueEntryId: null,
      };
    cur.dueToDate = round2(cur.dueToDate + owed);
    if (r.dueDate.getTime() < todayStart) {
      cur.overdue = round2(cur.overdue + owed);
      cur.overdueRows += 1;
      if (!cur.oldestOverdueDate) {
        cur.oldestOverdueDate = r.dueDate;
        cur.oldestOverdueEntryId = r.id;
      }
    }
    map.set(r.tenancyId, cur);
  }
  return map;
}
