import Link from 'next/link';
import { formatMoney } from '@/lib/tenancy-types';
import type { DashboardData } from '@/lib/dashboard';

const glassCard =
  'rounded-2xl border border-zinc-200 bg-card p-5 shadow-sm';
const label = 'font-semibold text-xs uppercase tracking-widest text-zinc-400';
const subCard = 'rounded-xl border border-zinc-100 bg-zinc-50 p-4';
const subLabel = 'font-medium text-[11px] uppercase tracking-wide text-zinc-400';

// Row 1 (right) — the "Current Month" card: month expected/collected + per-tenant
// collection progress (top 5, least paid first).
export default function MonthCollection({ d }: { d: DashboardData }) {
  const rows = d.tenantCollections;
  const top = rows.slice(0, 5);
  const more = rows.length - top.length;

  return (
    <div className={glassCard}>
      <h3 className={label + ' flex flex-wrap items-center gap-2'}>
        <span>
          {d.monthLabel}
          {d.isCurrentMonth ? ' · Current Period' : ''}
        </span>
        {d.isCurrentMonth && (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-800">
            CURRENT
          </span>
        )}
      </h3>

      {/* Expected + Collected sub-cards */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className={subCard}>
          <p className={subLabel}>Expected · {d.monthShort}</p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-amber-800">
            {formatMoney(d.monthlyExpected)}
          </p>
        </div>
        <div className={subCard}>
          <p className={subLabel}>Collected · {d.monthShort}</p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-emerald-700">
            {formatMoney(d.monthlyCollected)}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-[#3E5560]">
            {d.collectionRate}% collection rate
          </p>
        </div>
      </div>

      {/* Collection progress divider */}
      <div className="mb-3 mt-5 flex items-center gap-3">
        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-amber-800/80">
          Collection Progress
        </span>
        <span className="h-px flex-1 bg-[#DCE9EC]" />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-[#5B7280]">No active tenants.</p>
      ) : (
        <div className="space-y-3">
          {top.map((t, i) => {
            const pct = Math.min(100, Math.max(0, t.percentage));
            const bar =
              t.percentage >= 100
                ? 'bg-emerald-500'
                : t.percentage > 0
                  ? 'bg-amber-500'
                  : 'bg-red-500';
            return (
              <div key={`${t.unitName}-${i}`}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-medium text-[#223144]">
                    {t.tenantName}
                  </span>
                  <span className="shrink-0 whitespace-nowrap font-mono text-xs text-[#5B7280]">
                    {formatMoney(t.collectedThisMonth)} / {formatMoney(t.monthlyRent)}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#DCE9EC]">
                  <div
                    className={'h-full rounded-full ' + bar}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
          {more > 0 && (
            <Link
              href="/dashboard/rent"
              className="inline-block pt-1 text-xs font-semibold text-amber-800 transition-colors hover:text-amber-800"
            >
              +{more} more tenant{more === 1 ? '' : 's'} →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
