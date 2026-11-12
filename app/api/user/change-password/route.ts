import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Brute-force guard: the current password is re-verified on every call.
  const limit = rateLimit(`change-password:${session.user.id}`, 5, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { currentPassword, newPassword } = body as Record<string, unknown>;

  if (typeof currentPassword !== 'string' || !currentPassword) {
    return NextResponse.json({ error: 'Your current password is required.' }, { status: 400 });
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return NextResponse.json(
      { error: 'New password must be at least 8 characters.' },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, password: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) {
    return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });
  }

  try {
    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, resetToken: null, resetTokenExpiry: null },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Failed to change password:', err);
    return NextResponse.json(
      { error: 'Failed to update password. Please try again.' },
      { status: 500 },
    );
  }
}
