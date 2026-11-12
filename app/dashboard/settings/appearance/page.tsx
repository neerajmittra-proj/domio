import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import ThemeSettings from './theme-settings';

export default async function AppearanceSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-[#223144]">Settings</h1>
      <div className="mt-6 rounded-2xl border border-zinc-200 bg-[rgba(255,255,255,0.88)] p-6">
        <ThemeSettings />
      </div>
    </div>
  );
}
