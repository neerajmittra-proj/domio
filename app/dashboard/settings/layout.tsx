import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';

const TABS = [
  // Appearance (dark mode) hidden until dark mode is designed — see lib/theme-context.tsx
  { href: '/dashboard/settings/security', label: 'Security' },
  { href: '/dashboard/settings/notifications', label: 'Notifications' },
  { href: '/dashboard/settings/email-history', label: 'Email History' },
];

// Settings are owner-only.
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (session?.user?.role !== 'OWNER') {
    redirect('/dashboard');
  }
  return (
    <div className="mx-auto max-w-3xl">
      <nav className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="rounded-full border border-[#C2D9E0] bg-[rgba(255,255,255,0.5)] px-4 py-1.5 text-sm font-medium text-[#3E5560] transition-colors hover:border-[#8FA3AC] hover:text-[#223144]"
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
