import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { generateAndStoreOtp } from '@/lib/tenant-otp';
import { sendOtpToPhone } from '@/lib/phone-messaging';
import { generateTenantId } from '@/lib/display-ids';
import { resolveDataScope } from '@/lib/manager-access';
import { rateLimit, clientIp } from '@/lib/rate-limit';

const OTP_COOLDOWN_MS = 30 * 1000;

export async function POST(req: Request) {
  try {
    const { phone } = await req.json().catch(() => ({}));

    if (!phone || typeof phone !== 'string') {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    const raw = phone.trim();
    const digitsOnly = raw.replace(/\D/g, '');
    if (digitsOnly.length < 7 || digitsOnly.length > 15) {
      return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 });
    }
    const last10 = digitsOnly.slice(-10);

    // Throttle OTP requests (SMS cost + enumeration) per IP and per number.
    const ipCheck = rateLimit(`otp-ip:${clientIp(req)}`, 20, 60 * 60 * 1000);
    const phoneCheck = rateLimit(`otp-phone:${digitsOnly}`, 6, 60 * 60 * 1000);
    if (!ipCheck.ok || !phoneCheck.ok) {
      return NextResponse.json(
        { error: 'Too many code requests. Please try again later.' },
        { status: 429 },
      );
    }

    const phoneVariants = [
      { phone: raw },
      { phone: digitsOnly },
      { phone: `+${digitsOnly}` },
    ];
    const fuzzy = last10.length >= 7 ? [{ phone: { contains: last10 } }] : [];

    // 1. Search for existing Tenant — exact formats first, then a looser match.
    let tenant =
      (await prisma.tenant.findFirst({ where: { OR: phoneVariants } })) ??
      (fuzzy.length ? await prisma.tenant.findFirst({ where: { OR: fuzzy } }) : null);

    // 2. If not found in Tenant, check if user exists in User table
    if (!tenant) {
      const user =
        (await prisma.user.findFirst({ where: { OR: phoneVariants } })) ??
        (fuzzy.length ? await prisma.user.findFirst({ where: { OR: fuzzy } }) : null);

      if (user) {
        // Link or create corresponding Tenant record
        const existingProfile = await prisma.tenant.findUnique({ where: { userId: user.id } });
        if (existingProfile) {
          tenant = existingProfile;
        } else {
          const displayId = await generateTenantId().catch(() => null);
          const base = user.email?.split('@')[0]?.toLowerCase().replace(/[^a-z0-9_.]/g, '') || `tenant_${last10.slice(-4)}`;
          const username = (await prisma.tenant.findUnique({ where: { username: base } }))
            ? `${base}_${Math.floor(1000 + Math.random() * 9000)}`
            : base;
          tenant = await prisma.tenant.create({
            data: {
              displayId,
              userId: user.id,
              name: user.name,
              phone: user.phone || raw,
              email: user.email,
              username,
              portalEnabled: true,
              selfRegistered: true,
            },
          });
        }
      }
    }

    // 3. If still no tenant exists, auto-provision a self-registered tenant
    if (!tenant) {
      const displayId = await generateTenantId().catch(() => null);
      const suffix = last10.length >= 4 ? last10.slice(-4) : String(Math.floor(1000 + Math.random() * 9000));
      let username = `tenant_${suffix}`;
      if (await prisma.tenant.findUnique({ where: { username } })) {
        username = `tenant_${suffix}_${Math.floor(1000 + Math.random() * 9000)}`;
      }
      tenant = await prisma.tenant.create({
        data: {
          displayId,
          name: `Tenant (${raw})`,
          phone: raw,
          username,
          portalEnabled: true,
          selfRegistered: true,
        },
      });
    }

    // Is the caller the landlord (or their manager) generating a code for this
    // tenant from the dashboard? Only then may the code be shown on screen.
    let isOwnerCaller = false;
    const session = await auth().catch(() => null);
    if (session?.user && tenant.ownerId) {
      const ds = await resolveDataScope(session.user).catch(() => null);
      isOwnerCaller = !!ds && ds.ownerId === tenant.ownerId;
    }

    // Landlord-added tenants can only use the portal once the owner enables it.
    if (!tenant.portalEnabled && !isOwnerCaller) {
      return NextResponse.json(
        { error: 'Portal access has not been enabled for this number. Please contact your landlord.' },
        { status: 403 },
      );
    }

    // Cooldown between codes for the same tenant.
    const recent = await prisma.tenantOtp.findFirst({
      where: { tenantId: tenant.id, createdAt: { gte: new Date(Date.now() - OTP_COOLDOWN_MS) } },
      select: { id: true },
    });
    if (recent) {
      return NextResponse.json(
        { error: 'A code was just sent. Please wait 30 seconds before requesting another.' },
        { status: 429 },
      );
    }

    // 4. Generate 6-digit OTP
    const otp = await generateAndStoreOtp(tenant.id);

    // 5. Dispatch via SMS and/or WhatsApp
    const dispatchResult = await sendOtpToPhone(raw, otp);

    // The plaintext code (and the wa.me link, which embeds it) must never be
    // returned to an anonymous caller in production — that would let anyone
    // who knows a phone number log in as that tenant.
    const mayRevealCode =
      !dispatchResult.smsSent && (isOwnerCaller || process.env.NODE_ENV !== 'production');

    return NextResponse.json({
      success: true,
      tenantId: tenant.id,
      phone: raw,
      smsSent: dispatchResult.smsSent,
      whatsappSent: dispatchResult.whatsappSent,
      whatsappUrl: mayRevealCode ? dispatchResult.whatsappUrl : undefined,
      devOtp: mayRevealCode ? otp : undefined,
    });
  } catch (error) {
    console.error('Request OTP error:', error);
    return NextResponse.json({ error: 'Failed to generate OTP' }, { status: 500 });
  }
}
