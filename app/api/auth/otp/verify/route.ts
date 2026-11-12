import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { verifyUserOtpCode } from '@/lib/user-verification';
import { rateLimit } from '@/lib/rate-limit';

// Confirms the 6-digit code for the SIGNED-IN user's own email / phone.
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { otp, type } = body ?? {};

    if (type !== 'EMAIL_VERIFICATION' && type !== 'PHONE_VERIFICATION') {
      return NextResponse.json({ error: 'Invalid verification type.' }, { status: 400 });
    }
    if (!otp || typeof otp !== 'string' || !/^\d{6}$/.test(otp.trim())) {
      return NextResponse.json({ error: 'Please enter a valid 6-digit code.' }, { status: 400 });
    }

    const limit = rateLimit(`verify-check:${session.user.id}:${type}`, 15, 15 * 60 * 1000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.' },
        { status: 429 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, phone: true },
    });
    const target = type === 'EMAIL_VERIFICATION' ? user?.email : user?.phone;
    if (!target) {
      return NextResponse.json({ error: 'Nothing to verify on this account.' }, { status: 400 });
    }

    const result = await verifyUserOtpCode({
      userId: session.user.id,
      target,
      rawOtp: otp,
      type,
    });

    if (!result.verified) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }
    return NextResponse.json({ success: true, verified: true, message: result.message });
  } catch (error) {
    console.error('[POST /api/auth/otp/verify] Error:', error);
    return NextResponse.json({ error: 'Failed to verify code.' }, { status: 500 });
  }
}
