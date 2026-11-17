import { Resend } from 'resend';
import { brevoEmailConfigured, brevoSendEmail } from '@/lib/brevo';
import { gmailConfigured, gmailSendEmail } from '@/lib/gmail';

const resend = new Resend(process.env.RESEND_API_KEY || 're_123456789');

export const EMAIL_FROM = `${process.env.EMAIL_FROM_NAME || 'Domio'} <${process.env.EMAIL_FROM || 'noreply@domio.app'}>`;

// App URL for links in emails (login button, etc.).
export const APP_URL =
  process.env.APP_URL ?? process.env.AUTH_URL ?? 'http://localhost:3000';

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  // Brevo is the primary provider when its key is set; Resend is the fallback.
  // Provider order: Gmail (no domain needed) → Brevo (needs a verified sender)
  // → Resend. SMS goes through Brevo separately (lib/sms.ts).
  if (gmailConfigured()) {
    return gmailSendEmail({ to, subject, html, text });
  }
  if (brevoEmailConfigured()) {
    return brevoSendEmail({ to, subject, html, text });
  }
  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject,
      html,
      text,
    });
    if (error) return { success: false, error: error.message };
    return { success: true, id: data?.id };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
