import type { Metadata } from 'next';
import Link from 'next/link';
import '../globals.css';
import Logo from '@/components/brand/logo';

export const metadata: Metadata = {
  title: 'Tenant Portal — Domio',
  description: 'View your rent history, lease information, and payment status.',
};

export default function TenantPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-transparent text-[#223144] selection:bg-card selection:text-ink flex flex-col justify-between relative overflow-hidden">

      {/* Background architectural texture — same as homepage */}
      <div
        className="pointer-events-none fixed inset-0 bg-cover bg-center z-0"
        style={{
          backgroundImage: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.75), rgba(255,255,255,0) 65%), radial-gradient(circle at 88% 92%, rgba(164,71,61,0.20), rgba(164,71,61,0) 55%)',
        }}
      />

      {/* Nav bar — exact homepage style */}
      <header className="sticky top-0 z-40 w-full border-b border-[#223144]/12 bg-transparent backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo — identical to homepage: white bold text + grey pill */}
          <Link href="/" className="flex items-center gap-2">
            <Logo variant="horizontal" height={36} priority />
            <span className="rounded-full bg-[#223144]/8 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
              Tenant Portal
            </span>
          </Link>

          {/* Nav — same pattern as homepage */}
          <div className="flex items-center gap-3">
            <Link
              href="/search"
              className="hidden sm:inline-block text-xs font-semibold text-[#3E5560] hover:text-[#223144] transition-colors"
            >
              🔍 Browse Properties
            </Link>
            <Link
              href="/"
              className="rounded-full px-4 py-1.5 text-xs font-bold text-[#3E5560] hover:text-[#223144] transition-colors"
            >
              ← Home
            </Link>
            {/* White pill CTA — identical to "Sign Up Free →" on homepage */}
            <Link
              href="/login"
              className="rounded-full bg-brand-grad px-5 py-1.5 text-xs font-bold text-white hover:bg-brand-grad-hover transition-colors shadow-xs"
            >
              Owner Login →
            </Link>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        {children}
      </main>

      {/* Footer — same as homepage */}
      <footer className="relative z-10 border-t border-[#223144]/12 bg-card/75 py-6 text-center text-xs text-zinc-500">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} Domio Real Estate Platform. Tenant Self-Service Portal.</p>
          <div className="flex items-center gap-4 text-zinc-400">
            <Link href="/" className="hover:text-[#223144] transition-colors">Home</Link>
            <Link href="/search" className="hover:text-[#223144] transition-colors">Property Search</Link>
            <Link href="/login" className="hover:text-[#223144] transition-colors">Owner Login</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
