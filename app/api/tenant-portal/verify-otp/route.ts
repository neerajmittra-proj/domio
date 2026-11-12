import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyOtp, issueTenantJwt, TENANT_JWT_COOKIE, OtpError } from '@/lib/tenant-otp';
import { prisma } from '@/lib/prisma';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { part2Guard } from '@/lib/features';

export async function POST(req: Request) {
  const disabled = part2Guard();
  if (disabled) return disabled;
  try {
    const { tenantId, otp } = await req.json().catch(() => ({}));

    if (!tenantId || !otp || typeof tenantId !== 'string') {
      return NextResponse.json({ error: 'Tenant ID and OTP are required' }, { status: 400 });
    }
    if (!/^\d{6}$/.test(String(otp).trim())) {
      return NextResponse.json({ error: 'Enter the 6-digit code.' }, { status: 400 });
    }

    const limit = rateLimit(`otp-verify:${clientIp(req)}:${tenantId}`, 15, 15 * 60 * 1000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.' },
        { status: 429 },
      );
    }

    // Fetch tenant first so a disabled portal never reaches OTP checks.
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, phone: true, portalEnabled: true },
    });
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }
    if (!tenant.portalEnabled) {
      return NextResponse.json(
        { error: 'Portal access is disabled. Please contact your landlord.' },
        { status: 403 },
      );
    }

    await verifyOtp(tenantId, String(otp).trim());

    const token = await issueTenantJwt({ sub: tenant.id, name: tenant.name, phone: tenant.phone });
    const cookieStore = await cookies();
    cookieStore.set(TENANT_JWT_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof OtpError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Verify OTP error:', error);
    return NextResponse.json({ error: 'OTP verification failed' }, { status: 500 });
  }
}
