import { brevoSendSms, brevoSmsEnabled, type SendResult } from '@/lib/brevo';
import { sendPlainSms } from '@/lib/twilio';

// One place to send an SMS: Brevo when configured, otherwise the existing
// Twilio setup. Callers never need to know which provider is active.
export async function sendSms(to: string, text: string, tag?: string): Promise<SendResult> {
  if (brevoSmsEnabled()) return brevoSendSms({ to, text, tag });
  try {
    const r = await sendPlainSms(to, text);
    return r.sent ? { success: true, id: r.sid } : { success: false, error: r.reason };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
