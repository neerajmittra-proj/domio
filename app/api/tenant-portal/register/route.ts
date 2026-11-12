import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { generateTenantId } from '@/lib/display-ids';
import { issueTenantJwt, TENANT_JWT_COOKIE } from '@/lib/tenant-otp';
import { rateLimit, clientIp } from '@/lib/rate-limit';

const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;

export async function POST(req: Request) {
  try {
    const { username, name, phone, email, password } = await req.json().catch(() => ({}));

    if (!username || !name || !phone || !password) {
      return NextResponse.json(
        { error: 'Username, name, phone, and password are required.' },
        { status: 400 },
      );
    }
    if (
      typeof username !== 'string' || typeof name !== 'string' ||
      typeof phone !== 'string' || typeof password !== 'string'
    ) {
      return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
    }

    const limit = rateLimit(`register:${clientIp(req)}`, 10, 60 * 60 * 1000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many sign-ups from this network. Please try again later.' },
        { status: 429 },
      );
    }

    const cleanUsername = username.trim().toLowerCase().replace(/^@/, '');
    const cleanPhone = phone.trim();
    const cleanEmail = email && typeof email === 'string' && email.includes('@') ? email.trim().toLowerCase() : null;

    if (!USERNAME_RE.test(cleanUsername)) {
      return NextResponse.json(
        { error: 'Username must be 3–30 characters: letters, numbers, "_" or ".".' },
        { status: 400 },
      );
    }
    if (cleanPhone.replace(/\D/g, '').length < 7) {
      return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters.' },
        { status: 400 },
      );
    }

    // Check if username already taken
    const existing = await prisma.tenant.findUnique({
      where: { username: cleanUsername },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Username @${cleanUsername} is already taken. Please choose another.` },
        { status: 409 },
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const displayId = await generateTenantId().catch(() => null);

    let tenant;
    try {
      tenant = await prisma.tenant.create({
        data: {
          displayId,
          username: cleanUsername,
          name: name.trim(),
          phone: cleanPhone,
          email: cleanEmail,
          password: hashedPassword,
          portalEnabled: true,
          selfRegistered: true,
        },
      });
    } catch (err: any) {
      // Lost a race for the same username
      if (err?.code === 'P2002') {
        return NextResponse.json(
          { error: `Username @${cleanUsername} is already taken. Please choose another.` },
          { status: 409 },
        );
      }
      throw err;
    }

    const token = await issueTenantJwt({ sub: tenant.id, name: tenant.name, phone: tenant.phone });
    const cookieStore = await cookies();
    cookieStore.set(TENANT_JWT_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60,
    });

    return NextResponse.json({ success: true, tenantId: tenant.id }, { status: 201 });
  } catch (error) {
    console.error('Tenant self-register error:', error);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
