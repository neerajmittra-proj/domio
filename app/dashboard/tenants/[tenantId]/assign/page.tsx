import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getOwnedTenant } from '@/lib/tenants';
import { listVacantUnitsByProperty } from '@/lib/tenancies';
import { resolveDataScope } from '@/lib/manager-access';
import AssignForm from './assign-form';

export default async function AssignTenantPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { tenantId } = await params;
  // Resolve the effective owner ID (for managers, this is their owner's ID)
  const ds = await resolveDataScope(session.user);
  const tenant = await getOwnedTenant(tenantId, ds.ownerId, session.user.role);
  if (!tenant) notFound();

  // Query vacant units scoped to the effective owner so managers see the right properties
  const properties = await listVacantUnitsByProperty(ds.ownerId, session.user.role);

  return (
    <div className="min-h-full bg-[#fafaf9] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link
          href={`/dashboard/tenants/${tenantId}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 shadow-xs"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back to {tenant.name}
        </Link>

        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            Assign to Unit
          </h1>
          <p className="mt-1 mb-6 text-sm text-zinc-600">
            Create a tenancy for {tenant.name}.
          </p>
          <AssignForm tenantId={tenantId} properties={properties} />
        </div>
      </div>
    </div>
  );
}
