import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { resolveDataScope } from '@/lib/manager-access';
import { getOwnerStructure } from '@/lib/expenses';
import ExpenseForm, { type ExpenseInitialSelection } from '../expense-form';

export default async function NewExpensePage({
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

  // Pre-fill level + cascading selection (e.g. from a unit's "Add Expense" link).
  let initial: ExpenseInitialSelection | undefined;
  if (sp.subPropertyId || sp.propertyId) {
    for (const pf of structure) {
      for (const pr of pf.properties) {
        const isProp = pr.id === sp.propertyId;
        const hasUnit =
          sp.subPropertyId && pr.units.some((u) => u.id === sp.subPropertyId);
        if (isProp || hasUnit) {
          initial = {
            level: sp.subPropertyId ? 'UNIT' : 'PROPERTY',
            portfolioId: pf.id,
            propertyId: pr.id,
            subPropertyId: sp.subPropertyId ?? '',
          };
          break;
        }
      }
      if (initial) break;
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/dashboard/expenses"
        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-card px-4 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 shadow-xs"
      >
        ← Back to Expenses
      </Link>

      <div className="mt-4 rounded-2xl border border-[#DCE9EC] bg-card p-8 shadow-xs">
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-zinc-900">
          Log New Expense
        </h1>
        <ExpenseForm mode="create" structure={structure} initial={initial} />
      </div>
    </div>
  );
}
