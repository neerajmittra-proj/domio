import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getOwnedTenantDetail } from '@/lib/tenants';
import TenancyHistory, { type HistoryRow } from './tenancy-history';

import PortalAccessCard from './portal-access-card';

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-3 py-2 border-b border-white/5 last:border-0">
      <dt className="text-violet-300/70 font-medium">{label}</dt>
      <dd className="text-white font-semibold">{value || <span className="text-white/30 font-normal">—</span>}</dd>
    </div>
  );
}

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { tenantId } = await params;
  const tenant = await getOwnedTenantDetail(tenantId, session.user.id, session.user.role);
  if (!tenant) notFound();

  const rows: HistoryRow[] = tenant.tenancies.map((t) => {
    const unitName = t.subProperty?.name ?? t.rentableEntity?.name ?? 'Unit';
    const unitNumber = t.subProperty?.unitNumber ?? t.rentableEntity?.code ?? '—';
    const portfolioId = t.subProperty?.property.portfolioId ?? t.rentableEntity?.property.portfolioId ?? '';
    const propertyId = t.subProperty?.propertyId ?? t.rentableEntity?.propertyId ?? '';
    return {
      id: t.id,
      status: t.status,
      startDate: t.startDate.toISOString(),
      endDate: t.endDate.toISOString(),
      monthlyRent: t.monthlyRent,
      unitName,
      unitNumber,
      unitHref: `/dashboard/portfolios/${portfolioId}/properties/${propertyId}/units`,
    };
  });

  return (
    <div className="mx-auto max-w-4xl">
      {/* Back link */}
      <Link
        href="/dashboard/tenants"
        className="inline-flex items-center gap-1.5 text-sm text-violet-400 transition-colors hover:text-violet-200"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Back to Tenants
      </Link>

      {/* Header */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            {tenant.name}
          </h1>
          <p className="mt-1 text-sm text-violet-300/60">Tenant Profile</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/tenants/${tenant.id}/assign`}
            className="rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition-all hover:shadow-violet-500/50 hover:scale-105 active:scale-95"
          >
            Assign to Unit
          </Link>
          <Link
            href={`/dashboard/tenants/${tenant.id}/edit`}
            className="rounded-full border border-violet-500/40 bg-violet-500/10 px-5 py-2 text-sm font-semibold text-violet-200 transition-all hover:bg-violet-500/20 hover:border-violet-400/60"
          >
            Edit
          </Link>
        </div>
      </div>

      {/* Info cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <dl
          className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-[#1a1535] to-[#12102a] p-6 text-sm shadow-xl shadow-violet-900/20"
          style={{ backdropFilter: 'blur(12px)' }}
        >
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-500/20">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.19 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.11 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.09a16 16 0 0 0 6 6l.46-.46a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16z"/></svg>
            </span>
            <p className="text-xs font-bold uppercase tracking-widest text-violet-400">
              Contact &amp; Location
            </p>
          </div>
          <InfoRow label="Email" value={tenant.email} />
          <InfoRow label="Phone" value={tenant.phone} />
          <InfoRow label="Location" value={tenant.location} />
          <InfoRow label="National ID" value={tenant.nationalId} />
        </dl>
        <dl
          className="rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-[#131428] to-[#0e0d22] p-6 text-sm shadow-xl shadow-indigo-900/20"
          style={{ backdropFilter: 'blur(12px)' }}
        >
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-500/20">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </span>
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-400">
              Emergency &amp; Bank
            </p>
          </div>
          <InfoRow label="Emergency Contact" value={tenant.emergencyContactName} />
          <InfoRow label="Emergency Phone" value={tenant.emergencyContactPhone} />
          <InfoRow label="Bank" value={tenant.bankName} />
          <InfoRow label="Account" value={tenant.bankAccountNumber} />
        </dl>
      </div>

      <div className="mt-4">
        {(() => {
          const activeTenancy = tenant.tenancies.find((t) => t.status === 'ACTIVE') ?? tenant.tenancies[0];
          const propertyName =
            activeTenancy?.subProperty?.property
              ? (activeTenancy.subProperty as any).property.name ?? 'Property'
              : activeTenancy?.rentableEntity
                ? (activeTenancy.rentableEntity as any).property?.name ?? 'Property'
                : 'Property';
          const unitName =
            activeTenancy?.subProperty?.name ??
            activeTenancy?.rentableEntity?.name ??
            'Unit';
          return (
            <PortalAccessCard
              tenantId={tenant.id}
              phone={tenant.phone}
              initialEnabled={tenant.portalEnabled}
              tenantName={tenant.name}
              monthlyRent={activeTenancy?.monthlyRent ?? 0}
              propertyName={propertyName}
              unitName={unitName}
            />
          );
        })()}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-bold tracking-tight text-white flex items-center gap-2">
        <span className="inline-block h-1 w-6 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"></span>
        Tenancy History
      </h2>
      <TenancyHistory rows={rows} />
    </div>
  );
}
