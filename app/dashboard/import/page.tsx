import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { listPortfoliosForOwner } from '@/lib/portfolios';
import ImportWizard from './import-wizard';

export default async function ImportPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const portfolios = await listPortfoliosForOwner(session.user.id);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#223144]">
            Data Import
          </h1>
          <p className="mt-1 text-sm text-[#3E5560]">
            Bring historical property data into Domio from a spreadsheet.
          </p>
        </div>
        <Link
          href="/dashboard/import/history"
          className="rounded-full border border-[#C2D9E0] bg-[rgba(255,255,255,0.7)] px-4 py-2 text-sm font-medium text-[#223144] transition-colors hover:text-[#223144]"
        >
          Import History
        </Link>
      </div>

      <div className="mt-8">
        <ImportWizard
          portfolios={portfolios.map((p) => ({
            id: p.id,
            name: p.name,
          }))}
        />
      </div>
    </div>
  );
}
