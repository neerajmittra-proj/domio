import nodemailer from 'nodemailer';
import type { SendResult } from '@/lib/brevo';

// Send email through a Gmail account (Google's own SMTP), so no custom domain
// is needed and mail isn't flagged the way "@gmail.com via a third party" is.
// Limit: roughly 500 recipients/day on a normal Gmail account.
//
// Env:
//   GMAIL_USER          – the Gmail address, e.g. domiobey@gmail.com
//   GMAIL_APP_PASSWORD  – a 16-character App Password (Google Account › Security
//                         › 2-Step Verification › App passwords). NOT the normal
//                         Gmail password.
//   GMAIL_SENDER_NAME   – display name, default "Domio"

let transporter: nodemailer.Transporter | null = null;

export function gmailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER,
        // App passwords are shown with spaces; Gmail accepts them without.
        pass: (process.env.GMAIL_APP_PASSWORD ?? '').replace(/\s+/g, ''),
      },
    });
  }
  return transporter;
}

export async function gmailSendEmail(msg: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<SendResult> {
  if (!gmailConfigured()) return { success: false, error: 'GMAIL_USER / GMAIL_APP_PASSWORD not set' };
  try {
    const info = await getTransporter().sendMail({
      from: { name: process.env.GMAIL_SENDER_NAME || 'Domio', address: process.env.GMAIL_USER as string },
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    });
    return { success: true, id: info.messageId };
  } catch (e) {
    return { success: false, error: `Gmail send failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
