import { after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';
import { isRealEmail, isRealPhone } from '@/lib/rent-reminders';

// ─────────────────────────────────────────────────────────────────────────────
// Automatic tenant messages (email + SMS, sent through Brevo when configured):
//
//   WELCOME   – when a tenant is assigned to a unit
//   PRE_DUE   – on the 25th, for next month's rent
//   DUE_DAY   – on the due date, if still unpaid
//   OVERDUE   – every 5 days while unpaid, at most 3 times per late stretch
//   PAYMENT   – whenever the owner records a full or part payment
//   REVERSAL  – when a recorded payment is reduced or undone
//
// Every message is logged in RentReminder (kind + rentLedgerId) so the daily
// job never sends the same reminder twice, and owners can see what went out.
// All dates use India time (IST, UTC+5:30).
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const OVERDUE_EVERY_DAYS = 5;
const OVERDUE_MAX = 3;
const PRE_DUE_DAY_OF_MONTH = 25;

export type NotifyKind = 'WELCOME' | 'PRE_DUE' | 'DUE_DAY' | 'OVERDUE' | 'PAYMENT' | 'REVERSAL';

/**
 * Run a notification after the HTTP response is sent, so the owner never waits
 * for email/SMS and a provider failure can never break the save itself.
 */
export function notifyInBackground(label: string, fn: () => Promise<unknown>): void {
  const run = async () => {
    try {
      await fn();
    } catch (e) {
      console.error(`[notify:${label}]`, e);
    }
  };
  try {
    after(run);
  } catch {
    void run(); // outside a request scope (scripts/tests)
  }
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** Calendar parts of a moment in IST. */
function ist(d: Date) {
  const x = new Date(d.getTime() + IST_OFFSET_MS);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth(), day: x.getUTCDate() };
}
/** IST calendar day as a comparable number (days since epoch). */
function istDayNumber(d: Date): number {
  return Math.floor((d.getTime() + IST_OFFSET_MS) / DAY_MS);
}
function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}
function fmtMonth(d: Date): string {
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
}
function monthKey(d: Date): string {
  const p = ist(d);
  return `${p.y}-${String(p.m + 1).padStart(2, '0')}`;
}

type Ctx = {
  tenancyId: string;
  ownerId: string;
  tenantId: string;
  tenantName: string;
  email: string | null;
  phone: string | null;
  unit: string;
  property: string;
  ownerName: string;
  remindersOn: boolean;
  paymentMsgsOn: boolean;
  emailOn: boolean;
};

async function loadCtx(tenancyId: string): Promise<Ctx | null> {
  const t = await prisma.tenancy.findUnique({
    where: { id: tenancyId },
    select: {
      id: true,
      ownerId: true,
      tenant: { select: { id: true, name: true, email: true, phone: true, rentReminderEnabled: true } },
      subProperty: { select: { name: true, property: { select: { name: true } } } },
      rentableEntity: { select: { name: true, property: { select: { name: true } } } },
      owner: { select: { name: true, notificationConfig: true } },
    },
  });
  if (!t) return null;
  const cfg = t.owner?.notificationConfig;
  return {
    tenancyId: t.id,
    ownerId: t.ownerId,
    tenantId: t.tenant.id,
    tenantName: t.tenant.name,
    email: t.tenant.email && isRealEmail(t.tenant.email) ? t.tenant.email : null,
    phone: t.tenant.phone && isRealPhone(t.tenant.phone) ? t.tenant.phone : null,
    unit: t.subProperty?.name ?? t.rentableEntity?.name ?? 'your unit',
    property: t.subProperty?.property?.name ?? t.rentableEntity?.property?.name ?? '',
    ownerName: t.owner?.name ?? 'your landlord',
    remindersOn: t.tenant.rentReminderEnabled && (cfg ? cfg.rentReminderEnabled : true),
    paymentMsgsOn: cfg ? cfg.paymentConfirmEnabled : true,
    emailOn: cfg ? cfg.emailEnabled : true,
  };
}

/**
 * Safe testing: when NOTIFY_ONLY_TO is set (comma-separated emails and/or phone
 * numbers), messages go ONLY to those recipients; everyone else is skipped and
 * logged as SKIPPED_TEST. Set it locally so a test run against a shared
 * database never messages real tenants. Leave it unset in production.
 */
function testAllowList(): { emails: Set<string>; phones: Set<string> } | null {
  const raw = process.env.NOTIFY_ONLY_TO?.trim();
  if (!raw) return null;
  const emails = new Set<string>();
  const phones = new Set<string>();
  for (const part of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (part.includes('@')) emails.add(part.toLowerCase());
    else phones.add(part.replace(/\D/g, '').slice(-10));
  }
  return { emails, phones };
}

function place(c: Ctx): string {
  return c.property ? `${c.unit}, ${c.property}` : c.unit;
}

function emailHtml(c: Ctx, heading: string, lines: string[]): string {
  const body = lines.map((l) => `<p style="font-size:14px;color:#3E5560;line-height:1.55;margin:0 0 12px">${l}</p>`).join('');
  return `<div style="font-family:Arial,sans-serif;max-width:540px;margin:0 auto;padding:24px;border:1px solid #DCE9EC;border-radius:16px;background:#ffffff">
  <div style="background:#223144;padding:14px 20px;border-radius:10px;margin-bottom:20px"><h2 style="color:#ffffff;margin:0;font-size:18px">${heading}</h2></div>
  <p style="font-size:15px;color:#223144;margin:0 0 12px">Dear <strong>${c.tenantName}</strong>,</p>
  ${body}
  <p style="font-size:13px;color:#5A6E78;margin:20px 0 0">— ${c.ownerName}, via Domio</p>
</div>`;
}

/** Send one message on both channels, log it, and report what went out. */
async function deliver(
  c: Ctx,
  kind: NotifyKind,
  msg: { subject: string; heading: string; lines: string[]; sms: string },
  log: { rentLedgerId?: string | null; dueDate: Date; amount: number },
): Promise<{ email: boolean; sms: boolean }> {
  const allow = testAllowList();
  if (allow) {
    const email = c.email && allow.emails.has(c.email.toLowerCase()) ? c.email : null;
    const phone = c.phone && allow.phones.has(c.phone.replace(/\D/g, '').slice(-10)) ? c.phone : null;
    if (!email && !phone) {
      await prisma.rentReminder.create({
        data: {
          tenantId: c.tenantId,
          tenancyId: c.tenancyId,
          ownerId: c.ownerId,
          targetMonth: monthKey(log.dueDate),
          dueDate: log.dueDate,
          amount: log.amount,
          kind,
          rentLedgerId: log.rentLedgerId ?? null,
          channel: 'NONE',
          status: 'SKIPPED_TEST',
          errorMessage: 'NOTIFY_ONLY_TO is set and this tenant is not on it',
        },
      });
      console.log(`[notify] ${kind} for ${c.tenantName} skipped (test mode)`);
      return { email: false, sms: false };
    }
    c = { ...c, email, phone };
  }
  let emailOk = false;
  let smsOk = false;
  const errors: string[] = [];

  if (c.email && c.emailOn) {
    const r = await sendEmail({
      to: c.email,
      subject: msg.subject,
      html: emailHtml(c, msg.heading, msg.lines),
      text: [`Dear ${c.tenantName},`, ...msg.lines.map((l) => l.replace(/<[^>]+>/g, '')), `— ${c.ownerName}, via Domio`].join('\n\n'),
    });
    emailOk = r.success;
    if (!r.success && r.error) errors.push(`email: ${r.error}`);
  }
  if (c.phone) {
    const r = await sendSms(c.phone, msg.sms, kind.toLowerCase());
    smsOk = r.success;
    if (!r.success && r.error) errors.push(`sms: ${r.error}`);
  }

  await prisma.rentReminder.create({
    data: {
      tenantId: c.tenantId,
      tenancyId: c.tenancyId,
      ownerId: c.ownerId,
      targetMonth: monthKey(log.dueDate),
      dueDate: log.dueDate,
      amount: log.amount,
      kind,
      rentLedgerId: log.rentLedgerId ?? null,
      channel: emailOk && smsOk ? 'BOTH' : emailOk ? 'EMAIL' : smsOk ? 'SMS' : 'NONE',
      status: emailOk || smsOk ? 'SENT' : 'FAILED',
      errorMessage: errors.length ? errors.join(' | ').slice(0, 500) : !c.email && !c.phone ? 'No real email or phone on file' : null,
    },
  });
  console.log(`[notify] ${kind} → ${c.tenantName}: email=${emailOk} sms=${smsOk}${errors.length ? ' ' + errors.join(' | ') : ''}`);
  return { email: emailOk, sms: smsOk };
}

// ── Welcome on assignment ────────────────────────────────────────────────────
export async function notifyTenantAssigned(tenancyId: string): Promise<void> {
  const c = await loadCtx(tenancyId);
  if (!c) return;
  const t = await prisma.tenancy.findUnique({
    where: { id: tenancyId },
    select: { monthlyRent: true, startDate: true, paymentDayOfMonth: true },
  });
  if (!t) return;
  const dueDay = t.paymentDayOfMonth ?? 1;
  await deliver(
    c,
    'WELCOME',
    {
      subject: `Welcome to ${place(c)}`,
      heading: '🏠 Welcome to your new home',
      lines: [
        `You have been added as the tenant of <strong>${place(c)}</strong> from ${fmtDate(t.startDate)}.`,
        `Monthly rent: <strong>${inr(t.monthlyRent)}</strong>, due on day ${dueDay} of each month.`,
        `You'll get a reminder before rent is due and a confirmation whenever a payment is recorded.`,
      ],
      sms: `Domio: Hi ${c.tenantName}, you are now the tenant of ${place(c)}. Rent ${inr(t.monthlyRent)}/month, due on day ${dueDay}. Reminders will come to this number. - ${c.ownerName}`,
    },
    { dueDate: t.startDate, amount: t.monthlyRent },
  );
}

// ── Payment recorded / changed on a rent row ────────────────────────────────
export async function notifyRentPaymentChange(args: {
  rentLedgerId: string;
  previousPaid: number;
  newPaid: number;
}): Promise<void> {
  const delta = Math.round((args.newPaid - args.previousPaid) * 100) / 100;
  if (delta === 0) return;
  const row = await prisma.rentLedger.findUnique({
    where: { id: args.rentLedgerId },
    select: { id: true, tenancyId: true, amountDue: true, amountPaid: true, dueDate: true },
  });
  if (!row) return;
  const c = await loadCtx(row.tenancyId);
  if (!c || !c.paymentMsgsOn) return;

  const month = fmtMonth(row.dueDate);
  const left = Math.max(0, Math.round((row.amountDue - row.amountPaid) * 100) / 100);

  if (delta > 0) {
    const full = left === 0;
    await deliver(
      c,
      'PAYMENT',
      {
        subject: full ? `${month} rent received – fully paid` : `${inr(delta)} received for ${month} rent`,
        heading: full ? '✅ Rent fully paid' : '💳 Payment received',
        lines: full
          ? [`We've received <strong>${inr(delta)}</strong> for <strong>${month}</strong> rent of ${place(c)}.`, `${month} is now <strong>fully paid</strong>. Thank you!`]
          : [`We've received <strong>${inr(delta)}</strong> for <strong>${month}</strong> rent of ${place(c)}.`, `Remaining for ${month}: <strong>${inr(left)}</strong>.`],
        sms: full
          ? `Domio: Received ${inr(delta)} for ${month} rent (${c.unit}). ${month} is fully paid. Thank you! - ${c.ownerName}`
          : `Domio: Received ${inr(delta)} for ${month} rent (${c.unit}). Remaining for ${month}: ${inr(left)}. - ${c.ownerName}`,
      },
      { rentLedgerId: row.id, dueDate: row.dueDate, amount: delta },
    );
  } else {
    const removed = Math.abs(delta);
    await deliver(
      c,
      'REVERSAL',
      {
        subject: `Correction to your ${month} rent payment`,
        heading: 'ℹ️ Payment record corrected',
        lines: [
          `Your landlord corrected the payment record for <strong>${month}</strong> rent of ${place(c)}: ${inr(removed)} has been removed.`,
          left > 0 ? `Amount now due for ${month}: <strong>${inr(left)}</strong>.` : `${month} is still fully paid.`,
          `If you think this is a mistake, please contact your landlord.`,
        ],
        sms: `Domio: Your ${month} rent record for ${c.unit} was corrected (${inr(removed)} removed). ${left > 0 ? `Now due: ${inr(left)}.` : 'Still fully paid.'} - ${c.ownerName}`,
      },
      { rentLedgerId: row.id, dueDate: row.dueDate, amount: -removed },
    );
  }
}

// ── Payment entered in the unit's journal or via Ask Domi ────────────────────
export async function notifyJournalPayment(args: { tenancyId: string; amount: number; date: Date }): Promise<void> {
  if (args.amount <= 0) return;
  const c = await loadCtx(args.tenancyId);
  if (!c || !c.paymentMsgsOn) return;
  await deliver(
    c,
    'PAYMENT',
    {
      subject: `${inr(args.amount)} rent payment received`,
      heading: '💳 Payment received',
      lines: [`We've received <strong>${inr(args.amount)}</strong> towards rent for ${place(c)} on ${fmtDate(args.date)}. Thank you!`],
      sms: `Domio: Received ${inr(args.amount)} towards rent for ${c.unit} on ${fmtDate(args.date)}. Thank you! - ${c.ownerName}`,
    },
    { dueDate: args.date, amount: args.amount },
  );
}

// ── Daily reminder job (run by the cron route) ──────────────────────────────
export async function runRentReminderSweep(now = new Date()): Promise<{
  checked: number;
  sent: number;
  byKind: Record<string, number>;
}> {
  const today = istDayNumber(now);
  const t = ist(now);
  const isPreDueDay = t.day === PRE_DUE_DAY_OF_MONTH;
  // Next calendar month in IST, as [start, end) instants.
  const nextMonthStart = new Date(Date.UTC(t.y, t.m + 1, 1) - IST_OFFSET_MS);
  const nextMonthEnd = new Date(Date.UTC(t.y, t.m + 2, 1) - IST_OFFSET_MS);
  const tomorrowStartUtc = new Date((today + 1) * DAY_MS - IST_OFFSET_MS);

  const tenancies = await prisma.tenancy.findMany({
    where: { status: 'ACTIVE', tenant: { rentReminderEnabled: true } },
    select: { id: true },
  });

  const byKind: Record<string, number> = {};
  let sent = 0;

  for (const { id: tenancyId } of tenancies) {
    const rows = await prisma.rentLedger.findMany({
      where: {
        tenancyId,
        status: { not: 'PAID' },
        dueDate: { lt: isPreDueDay ? nextMonthEnd : tomorrowStartUtc },
      },
      orderBy: { dueDate: 'asc' },
      select: { id: true, dueDate: true, amountDue: true, amountPaid: true },
    });
    const open = rows.filter((r) => r.amountDue - r.amountPaid > 0.009);
    if (open.length === 0) continue;

    const overdue = open.filter((r) => istDayNumber(r.dueDate) < today);
    const dueToday = open.filter((r) => istDayNumber(r.dueDate) === today);
    const upcoming = isPreDueDay
      ? open.filter((r) => r.dueDate >= nextMonthStart && r.dueDate < nextMonthEnd)
      : [];

    // At most one message per tenant per day: overdue > due today > pre-due.
    let pick: { kind: NotifyKind; row: (typeof open)[number]; amount: number } | null = null;

    if (overdue.length) {
      const oldest = overdue[0];
      const total = overdue.reduce((s, r) => s + (r.amountDue - r.amountPaid), 0);
      const daysLate = today - istDayNumber(oldest.dueDate);
      const sentSoFar = await prisma.rentReminder.findMany({
        where: { tenancyId, kind: 'OVERDUE', status: 'SENT', createdAt: { gte: oldest.dueDate } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      const last = sentSoFar[0]?.createdAt;
      const gapOk = !last || today - istDayNumber(last) >= OVERDUE_EVERY_DAYS;
      if (daysLate >= OVERDUE_EVERY_DAYS && sentSoFar.length < OVERDUE_MAX && gapOk) {
        pick = { kind: 'OVERDUE', row: oldest, amount: total };
      }
    }
    if (!pick && dueToday.length) {
      const r = dueToday[0];
      const already = await prisma.rentReminder.count({ where: { rentLedgerId: r.id, kind: 'DUE_DAY', status: 'SENT' } });
      if (!already) pick = { kind: 'DUE_DAY', row: r, amount: r.amountDue - r.amountPaid };
    }
    if (!pick && upcoming.length) {
      const r = upcoming[0];
      const already = await prisma.rentReminder.count({ where: { rentLedgerId: r.id, kind: 'PRE_DUE', status: 'SENT' } });
      if (!already) pick = { kind: 'PRE_DUE', row: r, amount: r.amountDue - r.amountPaid };
    }
    if (!pick) continue;

    const c = await loadCtx(tenancyId);
    if (!c || !c.remindersOn) continue;

    const due = fmtDate(pick.row.dueDate);
    const amt = inr(pick.amount);
    const msg =
      pick.kind === 'PRE_DUE'
        ? {
            subject: `Rent reminder: ${amt} due on ${due}`,
            heading: '🗓️ Upcoming rent',
            lines: [`Your rent of <strong>${amt}</strong> for ${place(c)} is due on <strong>${due}</strong>.`, `Please pay on time. Ignore this if you have already paid.`],
            sms: `Domio: Hi ${c.tenantName}, rent of ${amt} for ${place(c)} is due on ${due}. Please pay on time. - ${c.ownerName}`,
          }
        : pick.kind === 'DUE_DAY'
          ? {
              subject: `Rent of ${amt} is due today`,
              heading: '⏰ Rent due today',
              lines: [`Your rent of <strong>${amt}</strong> for ${place(c)} is due <strong>today (${due})</strong>.`, `Ignore this if you have already paid.`],
              sms: `Domio: Hi ${c.tenantName}, rent of ${amt} for ${c.unit} is due today (${due}). - ${c.ownerName}`,
            }
          : {
              subject: `Overdue rent: ${amt} pending`,
              heading: '⚠️ Rent overdue',
              lines: [`<strong>${amt}</strong> rent for ${place(c)} is overdue (oldest due ${due}).`, `Please pay at the earliest or contact your landlord.`],
              sms: `Domio: Hi ${c.tenantName}, ${amt} rent for ${c.unit} is overdue since ${due}. Please pay at the earliest. - ${c.ownerName}`,
            };

    const res = await deliver(c, pick.kind, msg, { rentLedgerId: pick.row.id, dueDate: pick.row.dueDate, amount: pick.amount });
    if (res.email || res.sms) {
      sent += 1;
      byKind[pick.kind] = (byKind[pick.kind] ?? 0) + 1;
    }
  }

  return { checked: tenancies.length, sent, byKind };
}
