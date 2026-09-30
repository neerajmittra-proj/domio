import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getOwnedTenant } from '@/lib/tenants';
import TenantForm from '../../tenant-form';

export default async function EditTenantPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { tenantId } = await params;
  const tenant = await getOwnedTenant(tenantId, session.user.id, session.user.role);
  if (!tenant) notFound();

  return (
    <div className="min-h-full bg-[#fafaf9] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link
          href={`/dashboard/tenants/${tenant.id}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 shadow-xs"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back to {tenant.name}
        </Link>

        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-sm">
          <h1 className="mb-6 text-2xl font-bold tracking-tight text-zinc-900">
            Edit Tenant
          </h1>
        <TenantForm
          mode="edit"
          tenant={{
            id: tenant.id,
            name: tenant.name,
            email: tenant.email,
            phone: tenant.phone,
            nationalId: tenant.nationalId,
            emergencyContactName: tenant.emergencyContactName,
            emergencyContactPhone: tenant.emergencyContactPhone,
            bankAccountNumber: tenant.bankAccountNumber,
            bankName: tenant.bankName,
          }}
          activeTenancy={
            tenant.tenancies[0]
              ? {
                  id: tenant.tenancies[0].id,
                  monthlyRent: tenant.tenancies[0].monthlyRent,
                  startDate: tenant.tenancies[0].startDate.toISOString().slice(0, 10),
                  endDate: tenant.tenancies[0].endDate.toISOString().slice(0, 10),
                  paymentDayOfMonth: tenant.tenancies[0].paymentDayOfMonth,
                }
              : null
          }
        />
        </div>
      </div>
    </div>
  );
}
