import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { issueTenantJwt, TENANT_JWT_COOKIE } from '@/lib/tenant-otp';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { part2Guard } from '@/lib/features';

const INVALID = 'Invalid username/email/phone or password.';

export async function POST(req: Request) {
  const disabled = part2Guard();
  if (disabled) return disabled;
  try {
    const { username, password } = await req.json().catch(() => ({}));

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 },
      );
    }

    const clean = username.trim().toLowerCase().replace(/^@/, '');

    // Slow down password guessing per IP and per account identifier.
    const ipCheck = rateLimit(`pw-ip:${clientIp(req)}`, 30, 15 * 60 * 1000);
    const idCheck = rateLimit(`pw-id:${clean}`, 10, 15 * 60 * 1000);
    if (!ipCheck.ok || !idCheck.ok) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again in a few minutes.' },
        { status: 429 },
      );
    }

    // Search by username, email (case-insensitive), or phone
    const tenant = await prisma.tenant.findFirst({
      where: {
        OR: [
          { username: clean },
          { email: { equals: clean, mode: 'insensitive' } },
          { phone: username.trim() },
        ],
      },
    });

    // Same message for unknown account / no password / wrong password so the
    // endpoint cannot be used to discover which accounts exist.
    if (!tenant || !tenant.password) {
      return NextResponse.json({ error: INVALID }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, tenant.password);
    if (!valid) {
      return NextResponse.json({ error: INVALID }, { status: 401 });
    }

    if (!tenant.portalEnabled) {
      return NextResponse.json(
        { error: 'Portal access is disabled. Please contact your landlord.' },
        { status: 403 },
      );
    }

    const token = await issueTenantJwt({ sub: tenant.id, name: tenant.name, phone: tenant.phone });
    const cookieStore = await cookies();
    cookieStore.set(TENANT_JWT_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60, // 24 hours
    });

    return NextResponse.json({ success: true, tenantId: tenant.id });
  } catch (error) {
    console.error('Password login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
