import type { Metadata } from 'next';
import RegisterForm from './register-form';
import Logo from '@/components/brand/logo';
import PrivacyFooter from '@/components/legal/privacy-footer';

export const metadata: Metadata = {
  title: 'Create Account — Domio',
  description: 'Create your Domio account to start managing your properties.',
};

export default function RegisterPage() {
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

      <div className="relative z-10 w-full max-w-md">
        {/* Brand logo */}
        <div className="mb-5 flex justify-center">
          <Logo variant="full" height={170} priority />
        </div>

        <div className="rounded-2xl border border-[#C2D9E0] bg-[#FFFFFF] p-6 sm:p-8 shadow-xl backdrop-blur-sm">
          <RegisterForm />
        </div>
        <PrivacyFooter />
      </div>
    </div>
  );
}
