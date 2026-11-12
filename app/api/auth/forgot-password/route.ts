import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { sendEmail, APP_URL } from '@/lib/email';
import { rateLimit, clientIp } from '@/lib/rate-limit';

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

// Always answers with the same generic success so the endpoint can't be used
// to discover which emails have accounts.
const GENERIC = { success: true };

export async function POST(request: Request) {
  const limit = rateLimit(`forgot:${clientIp(request)}`, 5, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  const body = await request.json().catch(() => null);
  const email =
    body && typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || !email.includes('@')) return NextResponse.json(GENERIC);

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, active: true },
    });
    if (!user || !user.active) return NextResponse.json(GENERIC);

    // Only a SHA-256 hash of the token is stored; the raw token lives only in
    // the emailed link.
    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: hash, resetTokenExpiry: new Date(Date.now() + RESET_TTL_MS) },
    });

    const link = `${APP_URL}/reset-password?token=${token}`;
    await sendEmail({
      to: email,
      subject: 'Reset your Domio password',
      text: `Hi ${user.name},\n\nUse the link below to choose a new password. It expires in 1 hour.\n\n${link}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Hi ${user.name.replace(/[<>&]/g, '')},</p><p>Use the link below to choose a new password. It expires in 1 hour.</p><p><a href="${link}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
    });
  } catch (err) {
    console.error('Forgot-password failed:', err);
  }
  return NextResponse.json(GENERIC);
}
