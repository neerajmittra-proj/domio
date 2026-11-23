import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy · Domio',
  description: 'How Domio collects, uses, stores and protects your data.',
};

const UPDATED = '23 November 2026';
const CONTACT = 'domiobey@gmail.com';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-bold text-zinc-900">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-zinc-700">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#fafaf9] px-4 py-10">
      <article className="mx-auto max-w-3xl space-y-7 rounded-2xl border border-zinc-200 bg-white p-6 sm:p-10 shadow-sm">
        <header className="space-y-2">
          <Link href="/" className="text-xs font-semibold text-zinc-500 hover:text-zinc-900">← Back to Domio</Link>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Privacy Policy</h1>
          <p className="text-xs text-zinc-500">Last updated: {UPDATED}</p>
          <p className="text-sm leading-relaxed text-zinc-700">
            Domio is a property-management service operated by Invotech Services (&ldquo;we&rdquo;, &ldquo;us&rdquo;).
            This policy explains what data we collect when you use Domio, why we collect it, how we keep it safe,
            and the choices you have. By creating an account or using Domio you agree to this policy.
          </p>
        </header>

        <Section title="1. Data we collect">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Your account:</strong> name, email address, phone number, and a password (stored only as a one-way hash). If you sign in with Google we receive your name and email from Google.</li>
            <li><strong>Your properties:</strong> portfolios, properties, units and sub-units, rent amounts, leases, expenses, utility bills and documents you upload.</li>
            <li><strong>Your tenants:</strong> details you enter about tenants, such as name, phone, email, address, ID number, emergency contact and bank details, plus rent schedules and payment records.</li>
            <li><strong>Messages and activity:</strong> reminder and notification history, questions you ask the Domi AI assistant, and an audit log of changes made in your account.</li>
            <li><strong>Technical data:</strong> the minimum needed to run the service securely, such as sign-in session cookies and basic request logs.</li>
          </ul>
        </Section>

        <Section title="2. How we use it">
          <ul className="list-disc space-y-1 pl-5">
            <li>To provide Domio: show your dashboard, track rent, generate reports and keep your records.</li>
            <li>To send the messages you set up: rent reminders, payment confirmations, welcome and verification emails.</li>
            <li>To keep accounts secure: sign-in, verification codes, fraud prevention and the audit log.</li>
            <li>To answer your questions in Ask Domi, when you use it.</li>
          </ul>
          <p>We do <strong>not</strong> sell your data, and we do not use it for advertising.</p>
        </Section>

        <Section title="3. Tenant data entered by owners">
          <p>
            Owners and their managers decide what tenant information to store in Domio and are responsible for having
            the tenant&rsquo;s permission to do so. We process that information only to provide the service to the owner,
            for example to send rent reminders. Tenants can contact us at the address below about their data.
          </p>
        </Section>

        <Section title="4. Who helps us run Domio">
          <p>We use trusted service providers who process data only on our instructions:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Cloudflare:</strong> hosting the app and storing uploaded documents.</li>
            <li><strong>Neon:</strong> the secure database where your records are kept.</li>
            <li><strong>Google:</strong> sending emails and, if you choose it, Sign in with Google.</li>
            <li><strong>Anthropic:</strong> powers the Domi AI assistant; only what you type or attach in Ask Domi is sent to it.</li>
            <li><strong>SMS providers:</strong> only if SMS messages are switched on for your account.</li>
          </ul>
          <p>Some of these providers store data outside India, for example in the United States. They are bound to protect it.</p>
        </Section>

        <Section title="5. How we protect your data">
          <ul className="list-disc space-y-1 pl-5">
            <li>All traffic is encrypted with HTTPS.</li>
            <li>Passwords are stored only as secure hashes, never in plain text.</li>
            <li>Each owner sees only their own data; managers see only the properties an owner gives them.</li>
            <li>Changes to rent and ledger records are kept in an audit log.</li>
          </ul>
          <p>No system is perfectly secure, but we work to protect your data and will inform you of any breach that affects you, as the law requires.</p>
        </Section>

        <Section title="6. How long we keep it">
          <p>
            We keep your data while your account is active. If you ask us to delete your account, we delete or anonymise
            your data within 30 days, except records we must keep longer by law (for example financial records).
          </p>
        </Section>

        <Section title="7. Your rights">
          <p>
            Under India&rsquo;s Digital Personal Data Protection Act, 2023 and other applicable laws, you can ask to see the
            data we hold about you, correct it, delete it, or withdraw your consent, and you can raise a grievance.
            Email us at the address below and we will respond within 30 days.
          </p>
        </Section>

        <Section title="8. Cookies">
          <p>Domio uses only the cookies needed to keep you signed in and secure. We do not use advertising or tracking cookies.</p>
        </Section>

        <Section title="9. Children">
          <p>Domio is not meant for anyone under 18, and we do not knowingly collect their data.</p>
        </Section>

        <Section title="10. Changes and contact">
          <p>
            If we change this policy we will update the date above, and tell you in the app for important changes.
            Questions, requests or complaints (Grievance Officer): <a className="font-semibold underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </p>
        </Section>
      </article>
    </div>
  );
}
