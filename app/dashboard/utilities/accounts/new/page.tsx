import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { resolveDataScope } from '@/lib/manager-access';
import { getOwnerStructure } from '@/lib/expenses';
import AccountForm, { type AccountFormInitial } from '../account-form';

export default async function NewUtilityAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ subPropertyId?: string; propertyId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const ds = await resolveDataScope(session.user);
  const structure = await getOwnerStructure(
    ds.ownerId,
    ds.isManager ? ds.scope : undefined,
  );
  const sp = await searchParams;

  // Pre-fill level + cascading selection from query params (e.g. from a unit card).
  let initial: AccountFormInitial | undefined;
  if (sp.propertyId) {
    const portfolio = structure.find((p) =>
      p.properties.some((pr) => pr.id === sp.propertyId),
    );
    if (portfolio) {
      initial = {
        level: sp.subPropertyId ? 'UNIT' : 'PROPERTY',
        portfolioId: portfolio.id,
        propertyId: sp.propertyId,
        subPropertyId: sp.subPropertyId ?? '',
      };
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <Link
        href="/dashboard/utilities"
        className="text-sm text-[#223144] transition-colors hover:text-[#223144]"
      >
        ← Back to Utilities
      </Link>

      <div className="mt-4 rounded-2xl border border-[#C2D9E0] bg-[#FFFFFF] p-8 shadow-[0_10px_30px_-12px_rgba(34,49,68,0.30)]">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-[#223144]">
          Add Utility Account
        </h1>
        <AccountForm structure={structure} initial={initial} />
      </div>
    </div>
  );
}
