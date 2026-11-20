import { brevoSendSms, brevoSmsEnabled, type SendResult } from '@/lib/brevo';
import { sendOtpSms as twilioSendOtp, sendPlainSms, type TwilioSendResult } from '@/lib/twilio';

// One place for outgoing SMS: Brevo when BREVO_API_KEY is set (fetch-based, works
// on Cloudflare and Vercel), otherwise Twilio.
//
// SMS is OFF unless SMS_ENABLED=true. For now Domio is email-only: reminders,
// payment updates and verification codes all go by email. To turn SMS on later
// (after Brevo phone verification, SMS credits and India DLT registration), set
// SMS_ENABLED=true and NEXT_PUBLIC_SMS_ENABLED=true (the latter shows the phone
// verification tab and must be set before the build).

export function smsEnabled(): boolean {
  return process.env.SMS_ENABLED === 'true';
}

export async function sendSms(to: string, text: string, tag?: string): Promise<SendResult> {
  if (!smsEnabled()) return { success: false, error: 'SMS is turned off (email only)' };
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
  if (!smsEnabled()) return { sent: false, reason: 'SMS is turned off (email only)' };
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
