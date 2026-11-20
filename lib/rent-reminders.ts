import { prisma } from '@/lib/prisma';
import { sendEmail, APP_URL } from '@/lib/email';
import { sendSms, smsEnabled } from '@/lib/sms';
import { PART2_ENABLED } from '@/lib/features';

// Imported tenants were given placeholder contacts (e.g. name@placeholder.com,
// 9999999999). Never send reminders to those.
const PLACEHOLDER_EMAIL = /@(placeholder|example)\.(com|org|net|in)$/i;
export function isRealEmail(email: string): boolean {
  return /.+@.+\..+/.test(email) && !PLACEHOLDER_EMAIL.test(email.trim());
}
export function isRealPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return false;
  return !/^(\d)\1+$/.test(digits.slice(-10)) && digits.slice(-10) !== '1234567890';
}


export async function sendSingleRentReminder({
  tenantId,
  targetMonth,
  manual = false,
  ownerId,
}: {
  tenantId: string;
  targetMonth?: string;
  manual?: boolean;
  // When given, the tenant must belong to this owner (every API caller passes it).
  ownerId?: string;
}): Promise<{ success: boolean; message: string; stopped?: boolean }> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      owner: { select: { id: true, name: true, phone: true, email: true } },
      tenancies: {
        where: { status: 'ACTIVE' },
        include: {
          subProperty: { select: { name: true, unitNumber: true, property: { select: { name: true, address: true } } } },
          rentableEntity: { select: { name: true, code: true, property: { select: { name: true, address: true } } } },
        },
      },
    },
  });

  if (!tenant || !tenant.ownerId || (ownerId && tenant.ownerId !== ownerId)) {
    return { success: false, message: 'Tenant not found.' };
  }

  // Check if owner stopped reminders for this tenant (only blocks automated reminders, manual can override or respect)
  if (!tenant.rentReminderEnabled && !manual) {
    await prisma.rentReminder.create({
      data: {
        tenantId: tenant.id,
        ownerId: tenant.ownerId,
        targetMonth: targetMonth || new Date().toISOString().slice(0, 7),
        dueDate: new Date(),
        amount: 0,
        status: 'STOPPED_BY_OWNER',
        errorMessage: 'Reminders disabled by owner for this tenant',
      },
    });
    return {
      success: true,
      stopped: true,
      message: `Rent reminder skipped: Reminders are paused by owner for ${tenant.name}.`,
    };
  }

  const activeTenancy = tenant.tenancies[0];
  if (!activeTenancy) {
    return { success: false, message: 'Tenant has no active lease.' };
  }

  const propertyName =
    activeTenancy.subProperty?.property.name ||
    activeTenancy.rentableEntity?.property.name ||
    'Your Rental Space';
  const unitName =
    activeTenancy.subProperty?.name ||
    activeTenancy.rentableEntity?.name ||
    'Unit';

  const currentMonthStr = targetMonth || new Date().toISOString().slice(0, 7);

  // Remind about the earliest rent record that is not fully paid, using ITS due
  // date and its OUTSTANDING balance (not a guessed "1st of next month" and the
  // full monthly rent, which nagged tenants who had already paid).
  const nextUnpaid = await prisma.rentLedger.findFirst({
    where: { tenancyId: activeTenancy.id, status: { not: 'PAID' } },
    orderBy: { dueDate: 'asc' },
    select: { dueDate: true, amountDue: true, amountPaid: true },
  });
  if (!nextUnpaid || nextUnpaid.amountDue - nextUnpaid.amountPaid <= 0) {
    return { success: false, message: `${tenant.name} has no outstanding rent.` };
  }
  // Automated runs: don't send the same month's reminder twice.
  if (!manual) {
    const already = await prisma.rentReminder.findFirst({
      where: { tenantId: tenant.id, targetMonth: currentMonthStr, status: 'SENT' },
      select: { id: true },
    });
    if (already) {
      return { success: false, message: `Reminder already sent to ${tenant.name} for ${currentMonthStr}.` };
    }
  }
  const monthlyRent = Math.round((nextUnpaid.amountDue - nextUnpaid.amountPaid) * 100) / 100;
  const nextDueDate = nextUnpaid.dueDate;
  const formattedDueDate = nextDueDate.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

  // The tenant portal is Part 2; until it is on, link to nothing tenant-facing.
  const portalLink = PART2_ENABLED ? `${APP_URL}/tenant-portal` : '';
  let emailSent = false;
  let smsSent = false;
  const sendErrors: string[] = [];

  // 1. Send Email Reminder if tenant has email
  // Skip addresses/numbers created as placeholders during data import.
  if (tenant.email && isRealEmail(tenant.email)) {
    const emailResult = await sendEmail({
      to: tenant.email,
      subject: `Upcoming Rent Reminder: ${propertyName} (${unitName})`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1px solid #e4e4e7; border-radius: 16px; background: #ffffff;">
          <div style="background: #09090b; padding: 14px 20px; border-radius: 10px; margin-bottom: 20px;">
            <h2 style="color: #ffffff; margin: 0; font-size: 18px;">💳 Rent Payment Reminder</h2>
          </div>
          
          <p style="font-size: 15px; color: #27272a; margin-top: 0;">Dear <strong>${tenant.name}</strong>,</p>
          <p style="font-size: 14px; color: #52525b; line-height: 1.5;">
            This is a friendly reminder that your monthly rent for <strong>${propertyName} (${unitName})</strong> will be due on <strong>${formattedDueDate}</strong>.
          </p>

          <div style="background: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 12px; padding: 16px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="color: #71717a; padding: 4px 0;">Property:</td>
                <td style="font-weight: bold; color: #09090b; text-align: right;">${propertyName}</td>
              </tr>
              <tr>
                <td style="color: #71717a; padding: 4px 0;">Unit / Space:</td>
                <td style="font-weight: bold; color: #09090b; text-align: right;">${unitName}</td>
              </tr>
              <tr>
                <td style="color: #71717a; padding: 4px 0;">Monthly Rent Due:</td>
                <td style="font-weight: bold; color: #059669; font-size: 16px; text-align: right;">₹${monthlyRent.toLocaleString('en-IN')}</td>
              </tr>
              <tr>
                <td style="color: #71717a; padding: 4px 0;">Due Date:</td>
                <td style="font-weight: bold; color: #09090b; text-align: right;">${formattedDueDate}</td>
              </tr>
            </table>
          </div>

          ${tenant.bankAccountNumber ? `
          <div style="background: #fafafa; border: 1px dashed #d4d4d8; border-radius: 8px; padding: 12px; font-size: 12px; color: #52525b; margin-bottom: 20px;">
            <strong>Bank Transfer Details:</strong><br/>
            Bank: ${tenant.bankName || 'Direct Account'}<br/>
            Account: ${tenant.bankAccountNumber}
          </div>
          ` : ''}

          ${portalLink ? `
          <div style="text-align: center; margin: 24px 0;">
            <a href="${portalLink}" style="display: inline-block; background: #09090b; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: bold; font-size: 14px;">
              Open Tenant Portal &amp; View Ledger →
            </a>
          </div>
          ` : ''}

          <p style="font-size: 11px; color: #a1a1aa; text-align: center; margin-bottom: 0;">
            This is an automated reminder. Landlords can adjust or pause reminder preferences in their dashboard for free at any time.
          </p>
        </div>
      `,
      text: `Hello ${tenant.name}, friendly reminder that rent of ₹${monthlyRent.toLocaleString('en-IN')} for ${propertyName} (${unitName}) is due on ${formattedDueDate}. ${portalLink ? `You can review your ledger at ${portalLink}` : ''}`,
    });
    emailSent = emailResult.success;
    if (!emailResult.success) {
      sendErrors.push(`email: ${emailResult.error ?? 'unknown error'}`);
      console.error('[rent-reminder] email failed:', emailResult.error);
    }
  }

  // 2. Send SMS Reminder if tenant has phone
  if (tenant.phone && isRealPhone(tenant.phone)) {
    const smsMessage = `Domio Rent Reminder: Hello ${tenant.name}, rent of ₹${monthlyRent.toLocaleString('en-IN')} for ${propertyName} (${unitName}) is due on ${formattedDueDate}.${portalLink ? ` View details: ${portalLink}` : ''}`;
    const smsResult = await sendSms(tenant.phone, smsMessage, 'rent-reminder');
    smsSent = smsResult.success;
    if (!smsResult.success && smsEnabled()) sendErrors.push(`sms: ${smsResult.error ?? 'unknown error'}`);
  }

  // Log reminder
  await prisma.rentReminder.create({
    data: {
      tenantId: tenant.id,
      tenancyId: activeTenancy.id,
      ownerId: tenant.ownerId,
      targetMonth: currentMonthStr,
      dueDate: nextDueDate,
      amount: monthlyRent,
      channel: emailSent && smsSent ? 'BOTH' : emailSent ? 'EMAIL' : smsSent ? 'SMS' : 'FAILED',
      status: emailSent || smsSent ? 'SENT' : 'FAILED',
      errorMessage: sendErrors.length ? sendErrors.join(' | ').slice(0, 500) : null,
    },
  });

  return {
    success: emailSent || smsSent,
    message:
      emailSent || smsSent
        ? `Rent reminder sent to ${tenant.name} (${emailSent ? 'Email ✓' : ''} ${smsSent ? 'SMS ✓' : ''})`
        : `Could not send the reminder to ${tenant.name}: ${sendErrors.join(' | ') || 'no valid email on file'}`,
  };
}

export async function sendAllOwnerRentReminders(
  ownerId: string,
  // Manager scope: only remind tenants of units they can access.
  onlyTenantIds?: string[],
): Promise<{
  totalSent: number;
  totalSkipped: number;
  results: Array<{ tenantName: string; status: string }>;
}> {
  const tenants = await prisma.tenant.findMany({
    where: {
      ownerId,
      ...(onlyTenantIds ? { id: { in: onlyTenantIds } } : {}),
      tenancies: { some: { status: 'ACTIVE' } },
    },
  });

  let totalSent = 0;
  let totalSkipped = 0;
  const results: Array<{ tenantName: string; status: string }> = [];

  for (const t of tenants) {
    if (!t.rentReminderEnabled) {
      totalSkipped++;
      results.push({ tenantName: t.name, status: 'SKIPPED (Disabled by Owner)' });
      continue;
    }

    const res = await sendSingleRentReminder({ tenantId: t.id, ownerId });
    if (res.success && !res.stopped) {
      totalSent++;
      results.push({ tenantName: t.name, status: 'SENT' });
    } else {
      results.push({ tenantName: t.name, status: res.message });
    }
  }

  return { totalSent, totalSkipped, results };
}

export async function toggleTenantReminderSettings({
  tenantId,
  enabled,
  daysBefore,
  ownerId,
}: {
  tenantId: string;
  enabled: boolean;
  daysBefore?: number;
  ownerId: string;
}): Promise<{ success: boolean; tenant: any }> {
  // Scope the write to the caller's own tenant — an id alone must never be
  // enough to change another owner's tenant.
  const existing = await prisma.tenant.findFirst({
    where: { id: tenantId, ownerId },
    select: { id: true },
  });
  if (!existing) return { success: false, tenant: null };

  const days =
    daysBefore !== undefined && Number.isInteger(daysBefore)
      ? Math.min(Math.max(daysBefore, 0), 60)
      : undefined;
  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      rentReminderEnabled: enabled,
      ...(days !== undefined ? { rentReminderDaysBefore: days } : {}),
    },
  });

  return { success: true, tenant: updated };
}
