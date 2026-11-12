import { Suspense } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import TenantForm from '../tenant-form';

export default async function NewTenantPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  // Managers cannot create tenants (POST /api/tenants rejects them).
  if (session.user.role === 'MANAGER') notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/dashboard/tenants"
        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-card px-4 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 shadow-xs"
      >
        ← Back to Tenants
      </Link>

      <div className="mt-4 rounded-2xl border border-[#DCE9EC] bg-card p-8 shadow-xs">
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-zinc-900">
          Add New Tenant
        </h1>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-zinc-100" />}>
          <TenantForm mode="create" />
        </Suspense>
      </div>
    </div>
  );
}
