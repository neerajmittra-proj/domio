import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { resolveDataScope } from '@/lib/manager-access';
import {
  getCollectionMatrix,
  currentFyStartYear,
  type CollectionLevel,
} from '@/lib/collection-report';
import { formatMoney } from '@/lib/tenancy-types';
import ExportButton, { type ExportRow } from '@/components/ui/export-button';

export const dynamic = 'force-dynamic';

const money = (n: number) =>
  n > 0 ? formatMoney(n) : <span className="text-[#5B7280]">—</span>;
// Amounts owed render as negative (e.g. -₹1,60,000).
const owed = (n: number) =>
  n > 0 ? `-${formatMoney(n)}` : <span className="text-[#5B7280]">—</span>;
const owedGrand = (n: number) => (n > 0 ? `-${formatMoney(n)}` : formatMoney(0));

export default async function CollectionReportPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string; by?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const sp = await searchParams;

  const ds = await resolveDataScope(session.user);
  const scope = ds.isManager ? ds.scope : undefined;

  const parsedFy = Number(sp.fy);
  const fyStartYear = Number.isInteger(parsedFy) && parsedFy >= 2000 && parsedFy <= 2100
    ? parsedFy
    : currentFyStartYear();
  const by: CollectionLevel = sp.by === 'property' ? 'property' : 'unit';

  const m = await getCollectionMatrix(ds.ownerId, fyStartYear, by, scope);

  // Flatten to spreadsheet rows: Due, one row per month, then Total.
  const colName = (c: { label: string; sublabel?: string }) =>
    c.sublabel ? `${c.sublabel} — ${c.label}` : c.label;
  const exportRows: ExportRow[] = [
    {
      Month: 'Opening Balance (b/f)',
      ...Object.fromEntries(
        m.columns.map((c) => [colName(c), -(m.openingByColumn[c.id] ?? 0)]),
      ),
      Total: -m.grandOpening,
    },
    {
      Month: 'Total Due (current)',
      ...Object.fromEntries(
        m.columns.map((c) => [colName(c), -(m.dueByColumn[c.id] ?? 0)]),
      ),
      Total: -m.grandDue,
    },
    ...m.months.map((mo) => ({
      Month: mo.label,
      ...Object.fromEntries(
        m.columns.map((c) => [colName(c), m.received[c.id]?.[mo.key] ?? 0]),
      ),
      Total: m.totalByMonth[mo.key] ?? 0,
    })),
    {
      Month: 'Total Received',
      ...Object.fromEntries(
        m.columns.map((c) => [colName(c), m.totalByColumn[c.id] ?? 0]),
      ),
      Total: m.grandReceived,
    },
  ];

  const stickyCol =
    'sticky left-0 z-10 whitespace-nowrap border-r border-zinc-200 px-3 py-2';
  const numCell = 'whitespace-nowrap px-3 py-2 text-right tabular-nums';
  const fyLink = (fy: number) =>
    `/dashboard/reports/collection?by=${by}&fy=${fy}`;
  const byLink = (b: CollectionLevel) =>
    `/dashboard/reports/collection?by=${b}&fy=${fyStartYear}`;

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/dashboard/reports"
            className="text-sm text-[#3E5560] transition-colors hover:text-[#223144]"
          >
            ← Back to Reports
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#223144]">
            Collection Report
          </h1>
          <p className="text-sm text-[#3E5560]">
            Payments received by {by} and month · {m.fyLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Level toggle */}
          <div className="flex overflow-hidden rounded-full border border-[#C2D9E0]">
            {(['unit', 'property'] as const).map((b) => (
              <Link
                key={b}
                href={byLink(b)}
                className={
                  'px-3 py-1.5 text-sm capitalize transition-colors ' +
                  (by === b
                    ? 'bg-brand-grad text-white'
                    : 'bg-[rgba(255,255,255,0.5)] text-[#3E5560] hover:text-[#223144]')
                }
              >
                By {b}
              </Link>
            ))}
          </div>
          <Link
            href={fyLink(fyStartYear - 1)}
            className="rounded-full border border-[#C2D9E0] bg-[rgba(255,255,255,0.7)] px-3 py-1.5 text-sm text-[#3E5560] transition-colors hover:text-[#223144]"
          >
            ← {fyStartYear - 1}-{String(fyStartYear % 100).padStart(2, '0')}
          </Link>
          <Link
            href={fyLink(fyStartYear + 1)}
            className="rounded-full border border-[#C2D9E0] bg-[rgba(255,255,255,0.7)] px-3 py-1.5 text-sm text-[#3E5560] transition-colors hover:text-[#223144]"
          >
            {fyStartYear + 1}-{String((fyStartYear + 2) % 100).padStart(2, '0')} →
          </Link>
          <ExportButton
            rows={exportRows}
            filename={`collection-${by}-${m.fyLabel.replace(/\s/g, '-')}`}
            sheetName="Collection"
          />
        </div>
      </div>

      {m.columns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#C2D9E0] bg-[#FFFFFF] p-12 text-center">
          <p className="text-sm text-[#223144]">Nothing to report on yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#EAF2F4] text-xs uppercase tracking-wide text-zinc-500">
                <th className={stickyCol + ' bg-[#EAF2F4] text-left font-medium'}>
                  Month
                </th>
                {m.columns.map((c) => (
                  <th
                    key={c.id}
                    className="whitespace-nowrap px-3 py-2 text-right font-medium"
                    title={c.sublabel ? `${c.sublabel} — ${c.label}` : c.label}
                  >
                    <div>{c.label}</div>
                    {c.sublabel && (
                      <div className="text-[10px] font-normal normal-case text-[#3E5560]">
                        {c.sublabel}
                      </div>
                    )}
                  </th>
                ))}
                <th className="whitespace-nowrap px-3 py-2 text-right font-semibold text-[#223144]">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Opening balance carried in from before this FY — owed, yellow */}
              <tr className="border-t border-[rgba(232,160,32,0.25)] bg-[rgba(232,160,32,0.06)] font-medium text-[#B26A0B]">
                <td className={stickyCol + ' bg-[#EAF2F4] text-left'}>
                  Opening Balance (b/f)
                </td>
                {m.columns.map((c) => (
                  <td key={c.id} className={numCell}>
                    {owed(m.openingByColumn[c.id] ?? 0)}
                  </td>
                ))}
                <td className={numCell + ' font-semibold'}>
                  {owedGrand(m.grandOpening)}
                </td>
              </tr>

              {/* Total Due (current) — owed, red */}
              <tr className="border-y border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.06)] font-medium text-red-700">
                <td className={stickyCol + ' bg-[#F5E1DE] text-left'}>
                  Total Due (current)
                </td>
                {m.columns.map((c) => (
                  <td key={c.id} className={numCell}>
                    {owed(m.dueByColumn[c.id] ?? 0)}
                  </td>
                ))}
                <td className={numCell + ' font-semibold'}>
                  {owedGrand(m.grandDue)}
                </td>
              </tr>

              {/* Monthly received */}
              {m.months.map((mo, i) => (
                <tr
                  key={mo.key}
                  className={
                    'border-t border-zinc-200 ' +
                    (i % 2 ? 'bg-[rgba(34,49,68,0.035)]' : '')
                  }
                >
                  <td className={stickyCol + ' bg-[#FFFFFF] text-left text-[#223144]'}>
                    {mo.label}
                  </td>
                  {m.columns.map((c) => {
                    const note = m.notes[c.id]?.[mo.key];
                    return (
                      <td
                        key={c.id}
                        className={
                          numCell + ' text-zinc-500' + (note ? ' cursor-help' : '')
                        }
                        title={note || undefined}
                      >
                        {money(m.received[c.id]?.[mo.key] ?? 0)}
                      </td>
                    );
                  })}
                  <td className={numCell + ' font-medium text-[#223144]'}>
                    {money(m.totalByMonth[mo.key] ?? 0)}
                  </td>
                </tr>
              ))}

              {/* Total Received — bottom */}
              <tr className="border-t-2 border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.07)] font-semibold text-green-700">
                <td className={stickyCol + ' bg-[#E3EEE6] text-left'}>
                  Total Received
                </td>
                {m.columns.map((c) => (
                  <td key={c.id} className={numCell}>
                    {money(m.totalByColumn[c.id] ?? 0)}
                  </td>
                ))}
                <td className={numCell}>{formatMoney(m.grandReceived)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
