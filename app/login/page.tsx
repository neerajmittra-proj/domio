import { Suspense } from 'react';
import LoginForm from './login-form';
import Logo from '@/components/brand/logo';
import { PART2_ENABLED } from '@/lib/features';

export default function LoginPage() {
  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-16">
      {/* Terracotta glow — top-left */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 -top-40 h-[500px] w-[500px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(164,71,61,0.20) 0%, transparent 65%)',
        }}
      />
      {/* Navy glow — bottom-right */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-24 h-[420px] w-[420px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(34,49,68,0.16) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-10 w-full max-w-sm">
        {/* Brand logo */}
        <div className="mb-5 flex justify-center">
          <Logo variant="full" height={170} priority />
        </div>

        <div className="rounded-2xl border border-[#C2D9E0] bg-[#FFFFFF] p-8 shadow-xl">
          <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-[#223144]/5" />}>
            <LoginForm />
          </Suspense>
        </div>

        {PART2_ENABLED && (<>{/* Tenant Portal Registration & Login Options */}
        <div className="mt-4 rounded-2xl border border-[#C2D9E0] bg-[#FFFFFF]/70 p-4 text-center shadow-lg backdrop-blur-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Tenant Account Access
          </p>
          <div className="mt-2.5 flex items-center justify-center gap-2">
            <a
              href="/tenant-portal/register"
              className="flex-1 rounded-full border border-zinc-300 bg-brand-grad py-2 text-xs font-semibold text-white shadow-md transition-all hover:bg-brand-grad-hover"
            >
              👤 Register as Tenant
            </a>
            <a
              href="/tenant-portal/login"
              className="flex-1 rounded-full border border-zinc-200 bg-[rgba(255,255,255,0.7)] py-2 text-xs font-semibold text-[#223144] transition-colors hover:text-[#223144]"
            >
              🔐 Tenant Sign In
            </a>
          </div>
        </div>

        {/* Public Vacancy Search Link */}
        <div className="mt-4 text-center">
          <a
            href="/search"
            className="inline-flex items-center gap-2 rounded-full border border-[#8FA3AC]/30 bg-zinc-400/10 px-4 py-2 text-xs font-semibold text-zinc-500 transition-all hover:bg-zinc-400/20 hover:text-[#223144]"
          >
            <span>🔍 Looking to rent? Search Nearest Empty Properties</span>
          </a>
        </div></>)}
      </div>
    </div>
  );
}
