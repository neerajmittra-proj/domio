import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { resolveDataScope } from '@/lib/manager-access';
import { getOwnedExpense, getOwnerStructure } from '@/lib/expenses';
import type { ExpenseLevel } from '@/lib/expense-types';
import ExpenseForm from '../../expense-form';

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { id } = await params;
  // Managers act on their owner's data, limited to what they may edit.
  const ds = await resolveDataScope(session.user);
  const [expense, structure] = await Promise.all([
    getOwnedExpense(id, ds.ownerId),
    getOwnerStructure(ds.ownerId, ds.isManager ? ds.scope : undefined),
  ]);
  if (!expense) notFound();
  if (ds.isManager) {
    const canEdit = expense.subPropertyId
      ? ds.scope.editSubPropertyIds.has(expense.subPropertyId)
      : expense.propertyId
        ? ds.scope.editPropertyIds.has(expense.propertyId)
        : false;
    if (!canEdit) notFound();
  }

  const level: ExpenseLevel = expense.subPropertyId
    ? 'UNIT'
    : expense.propertyId
      ? 'PROPERTY'
      : 'PORTFOLIO';

  return (
    <div className="mx-auto max-w-lg">
      <Link
        href="/dashboard/expenses"
        className="text-sm text-[#223144] transition-colors hover:text-[#223144]"
      >
        ← Back to Expenses
      </Link>

      <div className="mt-4 rounded-2xl border border-[#C2D9E0] bg-[#FFFFFF] p-8 shadow-[0_10px_30px_-12px_rgba(34,49,68,0.30)]">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-[#223144]">
          Edit Expense
        </h1>
        <ExpenseForm
          mode="edit"
          structure={structure}
          expense={{
            id: expense.id,
            level,
            portfolioId: expense.portfolioId,
            propertyId: expense.propertyId,
            subPropertyId: expense.subPropertyId,
            category: expense.category,
            amount: expense.amount,
            date: expense.date.toISOString().slice(0, 10),
            description: expense.description,
          }}
        />
      </div>
    </div>
  );
}
