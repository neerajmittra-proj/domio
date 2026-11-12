import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import ManagerForm from '../manager-form';

export default async function NewManagerPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return (
    <div className="mx-auto max-w-lg">
      <Link
        href="/dashboard/managers"
        className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-[#3E5560] transition-colors hover:bg-[#223144]/5 hover:text-[#223144]"
      >
        ← Back to Managers
      </Link>
      <div className="mt-4 rounded-2xl border border-[#C2D9E0] bg-[#FFFFFF] p-8 shadow-[0_10px_30px_-12px_rgba(34,49,68,0.30)]">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-[#223144]">
          Add Manager
        </h1>
        <ManagerForm mode="create" />
      </div>
    </div>
  );
}
