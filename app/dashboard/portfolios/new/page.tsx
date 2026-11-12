import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import PortfolioForm from '../portfolio-form';

export default async function NewPortfolioPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role === 'MANAGER') notFound(); // managers cannot create portfolios

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link
        href="/dashboard/portfolios"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 transition-colors hover:text-zinc-900"
      >
        ← Back to Portfolios
      </Link>

      <div className="rounded-2xl border border-zinc-200/90 bg-card p-6 sm:p-8 shadow-xs">
        <h1 className="mb-6 text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">
          Add Portfolio
        </h1>
        <PortfolioForm mode="create" />
      </div>
    </div>
  );
}
