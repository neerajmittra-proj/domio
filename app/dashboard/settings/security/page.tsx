import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import ChangePasswordForm from './change-password-form';

export default async function SecuritySettingsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-[#223144]">Settings</h1>
      <div className="mt-6 rounded-2xl border border-zinc-200 bg-[rgba(255,255,255,0.88)] p-6">
        <ChangePasswordForm />
      </div>
    </div>
  );
}
