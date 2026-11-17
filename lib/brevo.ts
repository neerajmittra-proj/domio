// Brevo (ex-Sendinblue) transactional email + SMS over its REST API.
// Docs: https://developers.brevo.com/reference/sendtransacemail
//       https://developers.brevo.com/docs/transactional-sms-endpoints
//
// Env:
//   BREVO_API_KEY        – API key (Brevo › SMTP & API › API keys)
//   BREVO_SENDER_EMAIL   – a sender verified in Brevo (e.g. rent@yourdomain.in)
//   BREVO_SENDER_NAME    – display name, default "Domio"
//   BREVO_SMS_SENDER     – SMS sender name, max 11 letters/digits (e.g. DOMIO).
//                          For India this must be your DLT-approved 6-letter header.
//   BREVO_SMS_ENABLED    – set "false" to stop SMS without removing the key.

const API = 'https://api.brevo.com/v3';

export type SendResult = { success: boolean; id?: string; error?: string };

export function brevoConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY);
}

/** Brevo is used for email only when a verified sender address is also set. */
export function brevoEmailConfigured(): boolean {
  return brevoConfigured() && Boolean(process.env.BREVO_SENDER_EMAIL);
}

export function brevoSmsEnabled(): boolean {
  return brevoConfigured() && process.env.BREVO_SMS_ENABLED !== 'false';
}

async function post(path: string, body: unknown): Promise<SendResult> {
  try {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': process.env.BREVO_API_KEY ?? '',
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { messageId?: string | number; message?: string; code?: string };
    if (!res.ok) {
      return { success: false, error: `Brevo ${res.status}: ${data.message ?? data.code ?? 'request failed'}` };
    }
    return { success: true, id: data.messageId != null ? String(data.messageId) : undefined };
  } catch (e) {
    return { success: false, error: `Brevo request failed: ${String(e)}` };
  }
}

export async function brevoSendEmail(msg: {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<SendResult> {
  if (!brevoConfigured()) return { success: false, error: 'BREVO_API_KEY not set' };
  const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM;
  if (!senderEmail) return { success: false, error: 'BREVO_SENDER_EMAIL not set' };
  return post('/smtp/email', {
    sender: { email: senderEmail, name: process.env.BREVO_SENDER_NAME || process.env.EMAIL_FROM_NAME || 'Domio' },
    to: [{ email: msg.to, ...(msg.toName ? { name: msg.toName } : {}) }],
    subject: msg.subject,
    htmlContent: msg.html,
    ...(msg.text ? { textContent: msg.text } : {}),
  });
}

/** Brevo wants the number with country code and no "+": 919876543210. */
export function toBrevoRecipient(phone: string, defaultCountryCode = '91'): string | null {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (phone.trim().startsWith('+')) return digits;
  if (digits.length === 10) return `${defaultCountryCode}${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `${defaultCountryCode}${digits.slice(1)}`;
  return digits;
}

export async function brevoSendSms(msg: { to: string; text: string; tag?: string }): Promise<SendResult> {
  if (!brevoSmsEnabled()) return { success: false, error: 'Brevo SMS not enabled' };
  const recipient = toBrevoRecipient(msg.to);
  if (!recipient) return { success: false, error: 'Invalid phone number' };
  return post('/transactionalSMS/send', {
    type: 'transactional',
    sender: (process.env.BREVO_SMS_SENDER || 'DOMIO').slice(0, 11),
    recipient,
    content: msg.text,
    ...(msg.tag ? { tag: msg.tag } : {}),
  });
}
