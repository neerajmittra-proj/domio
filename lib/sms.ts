import { brevoSendSms, brevoSmsEnabled, type SendResult } from '@/lib/brevo';
import { sendOtpSms as twilioSendOtp, sendPlainSms, type TwilioSendResult } from '@/lib/twilio';

// One place for outgoing SMS: Brevo when BREVO_API_KEY is set (fetch-based, works
// on Cloudflare and Vercel), otherwise Twilio.

export async function sendSms(to: string, text: string, tag?: string): Promise<SendResult> {
  if (brevoSmsEnabled()) return brevoSendSms({ to, text, tag });
  try {
    const r = await sendPlainSms(to, text);
    return r.sent ? { success: true, id: r.sid } : { success: false, error: r.reason };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Send a login / verification code by SMS. Brevo first; if Brevo isn't set up
 * or fails, fall back to Twilio (which also tries WhatsApp). Same result shape
 * as the old Twilio-only helper, so callers don't change.
 */
export async function sendOtpSms(
  toPhone: string,
  otp: string,
  appName = 'Domio',
): Promise<TwilioSendResult> {
  if (brevoSmsEnabled()) {
    const r = await brevoSendSms({
      to: toPhone,
      text: `${otp} is your ${appName} verification code. It expires in 10 minutes. Do not share it with anyone.`,
      tag: 'otp',
    });
    if (r.success) {
      return { sent: true, channel: 'SMS', sid: r.id ?? 'brevo' };
    }
    console.error('[otp] Brevo SMS failed, trying Twilio:', r.error);
  }
  return twilioSendOtp(toPhone, otp, appName);
}
