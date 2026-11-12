import { NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { rateLimit, clientIp } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const limit = rateLimit(`reset:${clientIp(request)}`, 10, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  const body = await request.json().catch(() => null);
  const token = body && typeof body.token === 'string' ? body.token : '';
  const newPassword = body && typeof body.newPassword === 'string' ? body.newPassword : '';

  if (!token) {
    return NextResponse.json({ error: 'Invalid or expired reset link.' }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: 'New password must be at least 8 characters.' },
      { status: 400 },
    );
  }

  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const user = await prisma.user.findFirst({
    where: { resetToken: hash, resetTokenExpiry: { gt: new Date() } },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'Invalid or expired reset link.' }, { status: 400 });
  }

  try {
    const hashed = await bcrypt.hash(newPassword, 10);
    // Conditional on the token still matching so a link can be used only once.
    const res = await prisma.user.updateMany({
      where: { id: user.id, resetToken: hash },
      data: { password: hashed, resetToken: null, resetTokenExpiry: null },
    });
    if (res.count === 0) {
      return NextResponse.json({ error: 'Invalid or expired reset link.' }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Failed to reset password:', err);
    return NextResponse.json(
      { error: 'Could not reset password. Please try again.' },
      { status: 500 },
    );
  }
}
