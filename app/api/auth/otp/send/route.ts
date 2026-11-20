import { NextResponse } from 'next/server';
import { smsEnabled } from '@/lib/sms';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { requestUserVerificationOtp } from '@/lib/user-verification';
import { rateLimit } from '@/lib/rate-limit';

// Sends an email / phone verification code to the SIGNED-IN user's own
// address on file. The target is never taken from the request body, so this
// cannot be used to message arbitrary numbers or to verify someone else.
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const type = body?.type;
    if (type !== 'EMAIL_VERIFICATION' && type !== 'PHONE_VERIFICATION') {
      return NextResponse.json({ error: 'Invalid verification type.' }, { status: 400 });
    }
    if (type === 'PHONE_VERIFICATION' && !smsEnabled()) {
      return NextResponse.json(
        { error: 'Phone verification by SMS is not available yet. Please verify your email instead.' },
        { status: 400 },
      );
    }

    const limit = rateLimit(`verify-send:${session.user.id}:${type}`, 5, 60 * 60 * 1000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many code requests. Please try again later.' },
        { status: 429 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, phone: true, emailVerified: true, phoneVerified: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const isEmail = type === 'EMAIL_VERIFICATION';
    const target = isEmail ? user.email : user.phone;
    if (!target) {
      return NextResponse.json(
        { error: `No ${isEmail ? 'email address' : 'phone number'} is saved on your account.` },
        { status: 400 },
      );
    }
    if (isEmail ? user.emailVerified : user.phoneVerified) {
      return NextResponse.json(
        { error: `Your ${isEmail ? 'email' : 'phone number'} is already verified.` },
        { status: 400 },
      );
    }

    const result = await requestUserVerificationOtp({
      userId: session.user.id,
      type,
      target,
    });

    // When no email/SMS provider is configured the code can only be surfaced
    // on screen. That is fine while developing, but in production it would let
    // anyone "verify" an address they don't control, so it is withheld there.
    return NextResponse.json({
      success: true,
      message: result.message,
      previewCode: process.env.NODE_ENV !== 'production' ? result.previewCode : undefined,
    });
  } catch (error) {
    console.error('[POST /api/auth/otp/send] Error:', error);
    return NextResponse.json({ error: 'Failed to send verification code.' }, { status: 500 });
  }
}
