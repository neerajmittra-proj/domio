import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOwnerDetail } from '@/lib/owners';

const dateFmt = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

const glassCard =
  'rounded-2xl border border-[rgba(164,71,61,0.15)] bg-[rgba(255,255,255,0.88)] p-5 backdrop-blur-md shadow-[0_4px_20px_rgba(34,49,68,0.10)]';
const sectionLabel =
  'text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8D3B32]';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-[#3E5560]">{label}</dt>
      <dd className="text-[#223144]">{value}</dd>
    </div>
  );
}

export default async function OwnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const owner = await getOwnerDetail(id);
  if (!owner) notFound();

  const stats: [string, number][] = [
    ['Portfolios', owner.counts.portfolios],
    ['Properties', owner.counts.properties],
    ['Units', owner.counts.units],
    ['Tenants', owner.counts.tenants],
    ['Managers', owner.counts.managers],
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/dashboard/owners"
        className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-[#3E5560] transition-colors hover:bg-[#223144]/5 hover:text-[#223144]"
      >
        ← Back to Property Owners
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[#223144]">
          {owner.name}
        </h1>
        <span
          className={
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ' +
            (owner.active
              ? 'border border-[#A4473D]/30 bg-[#A4473D]/15 text-[#8D3B32]'
              : 'border border-red-500/20 bg-red-500/10 text-red-700')
          }
        >
          {owner.active ? 'Active' : 'Inactive'}
        </span>
        {owner.accountId && (
          <span className="font-mono text-sm text-[#8D3B32]">
            {owner.accountId}
          </span>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className={glassCard}>
          <p className={sectionLabel}>Owner Details</p>
          <dl className="mt-2">
            <InfoRow label="Name" value={owner.name} />
            <InfoRow label="Email" value={owner.email} />
            <InfoRow label="Phone" value={owner.phone || '—'} />
            <InfoRow label="Account ID" value={owner.accountId ?? '—'} />
            <InfoRow label="Status" value={owner.active ? 'Active' : 'Inactive'} />
            <InfoRow
              label="Created"
              value={dateFmt.format(new Date(owner.createdAt))}
            />
          </dl>
        </section>

        <section className={glassCard}>
          <p className={sectionLabel}>Portfolio Summary</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {stats.map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-[#C2D9E0] bg-[rgba(255,255,255,0.5)] p-3"
              >
                <p className="text-2xl font-semibold text-[#223144]">{value}</p>
                <p className="text-[10px] uppercase tracking-wide text-[#8D3B32]">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
