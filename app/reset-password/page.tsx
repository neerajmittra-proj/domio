import ResetPasswordForm from './reset-password-form';
import Logo from '@/components/brand/logo';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 -top-40 h-[500px] w-[500px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(164,71,61,0.20) 0%, transparent 65%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-24 h-[420px] w-[420px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(34,49,68,0.16) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-5 flex justify-center">
          <Logo variant="full" height={170} priority />
        </div>

        <div className="rounded-2xl border border-[#C2D9E0] bg-[#FFFFFF] p-8 shadow-xl">
          <div className="mb-6 flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-[#223144]">
              Reset password
            </h1>
            <p className="text-sm text-[#223144]">
              Choose a new password for your Domio account.
            </p>
          </div>
          <ResetPasswordForm token={token ?? ''} />
        </div>
      </div>
    </div>
  );
}
