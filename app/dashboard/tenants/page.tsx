import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { listTenantsForOwner } from '@/lib/tenants';
import { resolveDataScope } from '@/lib/manager-access';
import TenantsGrid from './tenants-grid';
import Link from 'next/link';
import { PART2_ENABLED } from '@/lib/features';

export default async function TenantsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (
    session.user.role !== 'OWNER' &&
    session.user.role !== 'MANAGER' &&
    session.user.role !== 'SUPER_ADMIN'
  ) {
    redirect('/dashboard');
  }

  const ds = await resolveDataScope(session.user);
  const tenants = await listTenantsForOwner(
    ds.ownerId,
    ds.isManager ? ds.scope.subPropertyIds : undefined,
    session.user.role,
  );

  const totalTenants = tenants.length;
  const activeTenancies = tenants.filter(
    (t) => t.currentTenancy && t.currentTenancy.status === 'ACTIVE',
  ).length;
  const overdueTenants = tenants.filter(
    (t) => (t.currentTenancy?.currentBalance ?? 0) < 0,
  ).length;
  const unassignedTenants = tenants.filter((t) => !t.currentTenancy).length;

  return (
    <div className="min-h-full">
      {/* ── Signature Dark Architectural Hero for Tenants ────────────────── */}
      <section className="relative overflow-hidden bg-transparent py-12 sm:py-16 text-[#223144]">

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#223144]/18 bg-[#223144]/8 px-3 py-1 text-xs font-medium backdrop-blur-md">
                <span>👥</span>
                <span>Tenant & Lease Management</span>
              </div>
              <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-[#223144] leading-tight">
                Tenant Directory
              </h1>
              <p className="mt-2 text-sm sm:text-base text-[#3E5560] max-w-2xl font-normal">
                Manage your active tenancies, track arrears, store lease documents, and maintain direct tenant communications.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {PART2_ENABLED && (<Link
                href="/tenant-portal/login"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-[#223144]/18 bg-[#223144]/8 px-5 py-3 text-sm font-bold text-[#223144] backdrop-blur-md transition-all hover:bg-[#223144]/8 hover:scale-105 active:scale-95"
              >
                🔑 Open Tenant Portal
              </Link>)}
              <Link
                href="/dashboard/tenants/new"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-grad px-5 py-3 text-sm font-bold text-white transition-all hover:bg-brand-grad-hover hover:scale-105 active:scale-95 shadow-lg"
              >
                <span>+</span> Add New Tenant
              </Link>
            </div>
          </div>

          {/* Quick Metrics Bar inside Hero */}
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-[#223144]/18 bg-card/65 p-4 backdrop-blur-md">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Total Tenants
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-[#223144]">
                {totalTenants}
              </p>
            </div>
            <div className="rounded-xl border border-[#223144]/18 bg-card/65 p-4 backdrop-blur-md">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Active Leases
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-emerald-700">
                {activeTenancies}
              </p>
            </div>
            <div className="rounded-xl border border-[#223144]/18 bg-card/65 p-4 backdrop-blur-md">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                In Arrears
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-red-700">
                {overdueTenants}
              </p>
            </div>
            <div className="rounded-xl border border-[#223144]/18 bg-card/65 p-4 backdrop-blur-md">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Unassigned
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-[#3E5560]">
                {unassignedTenants}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Active Tenant Directory & Grid Below ────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <TenantsGrid tenants={tenants} />
      </div>
    </div>
  );
}
