import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getOwnedTenantDetail } from '@/lib/tenants';
import TenancyHistory, { type HistoryRow } from './tenancy-history';

import PortalAccessCard from './portal-access-card';

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between items-center gap-3 py-2.5 border-b border-zinc-100 last:border-0">
      <dt className="text-sm font-medium text-zinc-500">{label}</dt>
      <dd className="text-sm font-semibold text-zinc-900 text-right">
        {value || <span className="text-zinc-400 font-normal">—</span>}
      </dd>
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
    <div className="min-h-full bg-[#fafaf9] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        {/* Back link */}
        <Link
          href="/dashboard/tenants"
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 shadow-xs"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back to Tenants
        </Link>

        {/* Header */}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-zinc-200/70 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 mb-1.5 border border-zinc-300">
              Tenant Profile
            </div>
            <h1 className="text-3xl font-black tracking-tight text-zinc-900 sm:text-4xl">
              {tenant.name}
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              {tenant.email ? tenant.email + ' · ' : ''}{tenant.phone}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/dashboard/tenants/${tenant.id}/assign`}
              className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-zinc-800 active:scale-95"
            >
              Assign to Unit
            </Link>
            <Link
              href={`/dashboard/tenants/${tenant.id}/edit`}
              className="rounded-xl border border-zinc-300 bg-white px-5 py-2.5 text-sm font-bold text-zinc-700 shadow-xs transition hover:bg-zinc-50 hover:text-zinc-900 active:scale-95"
            >
              Edit
            </Link>
          </div>
        </div>

        {/* Info cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <dl
            className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm shadow-sm"
          >
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.19 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.11 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.09a16 16 0 0 0 6 6l.46-.46a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16z"/></svg>
              </span>
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-800">
                Contact &amp; Location
              </p>
            </div>
            <InfoRow label="Email" value={tenant.email} />
            <InfoRow label="Phone" value={tenant.phone} />
            <InfoRow label="Location" value={tenant.location} />
            <InfoRow label="National ID" value={tenant.nationalId} />
          </dl>
          <dl
            className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm shadow-sm"
          >
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </span>
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-800">
                Emergency &amp; Bank
              </p>
            </div>
            <InfoRow label="Emergency Contact" value={tenant.emergencyContactName} />
            <InfoRow label="Emergency Phone" value={tenant.emergencyContactPhone} />
            <InfoRow label="Bank" value={tenant.bankName} />
            <InfoRow label="Account" value={tenant.bankAccountNumber} />
          </dl>
        </div>

        <div className="mt-6">
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

        <h2 className="mb-3 mt-8 text-lg font-bold tracking-tight text-zinc-900 flex items-center gap-2">
          <span className="inline-block h-1.5 w-6 rounded-full bg-zinc-900"></span>
          Tenancy History
        </h2>
        <TenancyHistory rows={rows} />
      </div>
    </div>
  );
}
