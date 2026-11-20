import type { SendResult } from '@/lib/brevo';

// Send email through a Gmail account (Google's own SMTP), so no custom domain
// is needed and mail isn't flagged the way "@gmail.com via a third party" is.
// Limit: roughly 500 recipients/day on a normal Gmail account.
//
// Runtimes:
// - Cloudflare Workers: `worker-mailer` (SMTP over Cloudflare TCP sockets), via
//   the bridge in worker.ts. nodemailer does not run on Workers.
// - Node (Vercel / next dev): nodemailer.
// Both are loaded lazily so each runtime only touches the library it can run.
//
// Env:
//   GMAIL_USER          – the Gmail address, e.g. domiobey@gmail.com
//   GMAIL_APP_PASSWORD  – a 16-character App Password (Google Account › Security
//                         › 2-Step Verification › App passwords). NOT the normal
//                         Gmail password.
//   GMAIL_SENDER_NAME   – display name, default "Domio"

const isWorkers =
  typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

export function gmailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function creds() {
  return {
    user: process.env.GMAIL_USER as string,
    // App passwords are shown with spaces; Gmail accepts them without.
    pass: (process.env.GMAIL_APP_PASSWORD ?? '').replace(/\s+/g, ''),
    name: process.env.GMAIL_SENDER_NAME || 'Domio',
  };
}

type Msg = { to: string; subject: string; html: string; text?: string };

type SmtpBridge = (m: {
  host: string;
  port: number;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}) => Promise<void>;

// On Cloudflare the SMTP client lives in worker.ts (see there for why) and is
// exposed as globalThis.__domioSmtpSend.
async function sendOnWorkers(msg: Msg): Promise<string | undefined> {
  const { user, pass, name } = creds();
  const send = (globalThis as unknown as { __domioSmtpSend?: SmtpBridge }).__domioSmtpSend;
  if (!send) throw new Error('SMTP bridge not available (worker.ts not loaded)');
  await send({
    host: 'smtp.gmail.com',
    port: 465,
    username: user,
    password: pass,
    fromName: name,
    fromEmail: user,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text ?? msg.html.replace(/<[^>]+>/g, ' '),
  });
  return undefined;
}

let nodeTransport: import('nodemailer').Transporter | null = null;

async function sendOnNode(msg: Msg): Promise<string | undefined> {
  const { user, pass, name } = creds();
  if (!nodeTransport) {
    const nodemailer = (await import('nodemailer')).default;
    nodeTransport = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass },
    });
  }
  const info = await nodeTransport.sendMail({
    from: { name, address: user },
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
  });
  return info.messageId;
}

export async function gmailSendEmail(msg: Msg): Promise<SendResult> {
  if (!gmailConfigured()) return { success: false, error: 'GMAIL_USER / GMAIL_APP_PASSWORD not set' };
  try {
    const id = isWorkers ? await sendOnWorkers(msg) : await sendOnNode(msg);
    return { success: true, id };
  } catch (e) {
    return { success: false, error: `Gmail send failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
