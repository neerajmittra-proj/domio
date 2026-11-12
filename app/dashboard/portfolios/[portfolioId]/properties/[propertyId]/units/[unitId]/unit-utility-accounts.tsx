'use client';

import { useEffect, useState } from 'react';
import type { UtilityType, BillStatus } from '@prisma/client';
import type { UtilityBillListItem } from '@/lib/utilities';
import {
  utilityTypeIcon,
  utilityTypeLabel,
  billStatusBadgeClass,
  billStatusLabel,
} from '@/lib/utility-types';
import { formatMoney, formatDate } from '@/lib/tenancy-types';

export type UnitUtilityAccountRow = {
  id: string;
  type: UtilityType;
  provider: string;
  accountNumber: string;
  latestBill: { amount: number; dueDate: string; status: BillStatus } | null;
};

function AccountBills({ accountId }: { accountId: string }) {
  const [bills, setBills] = useState<UtilityBillListItem[] | null>(null);
  useEffect(() => {
    let active = true;
    fetch(`/api/utility-bills?utilityAccountId=${encodeURIComponent(accountId)}`)
      .then((r) => (r.ok ? r.json() : { bills: [] }))
      .then((d) => active && setBills(d.bills as UtilityBillListItem[]))
      .catch(() => active && setBills([]));
    return () => {
      active = false;
    };
  }, [accountId]);

  if (bills === null)
    return <p className="px-3 py-2 text-xs text-[#3E5560]">Loading bills…</p>;
  if (bills.length === 0)
    return <p className="px-3 py-2 text-xs text-[#3E5560]">No bills yet.</p>;
  return (
    <ul className="space-y-1 px-3 py-2">
      {bills.map((b) => (
        <li
          key={b.id}
          className="flex items-center justify-between gap-2 rounded-md bg-[rgba(34,49,68,0.035)] px-2 py-1 text-xs"
        >
          <span className="text-[#3E5560]">{formatDate(b.dueDate)}</span>
          <span className="text-[#223144]">{formatMoney(b.amount)}</span>
          <span
            className={
              'rounded-full px-2 py-0.5 text-[10px] font-medium ' +
              billStatusBadgeClass(b.status)
            }
          >
            {billStatusLabel(b.status)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function UnitUtilityAccounts({
  accounts,
}: {
  accounts: UnitUtilityAccountRow[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (accounts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[rgba(164,71,61,0.15)] px-3 py-8 text-center">
        <div className="text-2xl">⚡</div>
        <p className="mt-2 text-sm text-[#3E5560]">
          No utility accounts linked to this unit
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {accounts.map((a) => {
        const open = openId === a.id;
        return (
          <div
            key={a.id}
            className="rounded-xl border border-[rgba(164,71,61,0.15)] bg-[rgba(34,49,68,0.035)] transition-colors hover:bg-[rgba(164,71,61,0.05)]"
          >
            <div className="flex flex-wrap items-center gap-3 p-3">
              {/* Type icon in a circle */}
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(164,71,61,0.15)] text-base">
                <span aria-hidden>{utilityTypeIcon(a.type)}</span>
              </span>

              {/* Provider + account */}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-[#223144]">
                  {a.provider}
                  <span className="ml-2 text-xs font-normal text-[#3E5560]">
                    {utilityTypeLabel(a.type)}
                  </span>
                </p>
                <p className="truncate text-xs text-[#3E5560]">
                  #{a.accountNumber}
                </p>
              </div>

              {/* Latest bill */}
              <div className="text-right">
                <p className="text-sm font-medium text-[#223144]">
                  {a.latestBill ? formatMoney(a.latestBill.amount) : '—'}
                </p>
                <p className="text-xs text-[#3E5560]">
                  {a.latestBill ? `Due ${formatDate(a.latestBill.dueDate)}` : 'No bills'}
                </p>
              </div>

              {/* Status */}
              {a.latestBill && (
                <span
                  className={
                    'inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ' +
                    billStatusBadgeClass(a.latestBill.status)
                  }
                >
                  {billStatusLabel(a.latestBill.status)}
                </span>
              )}

              {/* View bills */}
              <button
                type="button"
                onClick={() => setOpenId(open ? null : a.id)}
                aria-expanded={open}
                className="min-h-[36px] shrink-0 rounded-full border border-[rgba(141,59,50,0.4)] bg-[rgba(255,255,255,0.7)] px-3 py-1 text-xs font-medium text-[#223144] transition-colors hover:text-[#223144]"
              >
                {open ? 'Hide Bills' : 'View Bills'}
              </button>
            </div>

            {open && (
              <div className="border-t border-[rgba(164,71,61,0.15)]">
                <AccountBills accountId={a.id} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
