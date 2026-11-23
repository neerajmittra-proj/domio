import Link from 'next/link';

// Small footer with the Privacy Policy link, shown on the public pages and the
// dashboard so owners and tenants can always see how their data is handled.
export default function PrivacyFooter({ dark = false }: { dark?: boolean }) {
  const text = dark ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-zinc-900';
  return (
    <footer className={`py-4 text-center text-xs ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>
      <span>© {new Date().getFullYear()} Domio · Invotech Services</span>
      <span className="mx-2">·</span>
      <Link href="/privacy" className={`font-semibold underline-offset-2 hover:underline ${text}`}>
        Privacy Policy
      </Link>
    </footer>
  );
}
