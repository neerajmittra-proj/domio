import { NextResponse } from 'next/server';
import { runRentReminderSweep } from '@/lib/tenant-notifications';

// Daily job (Vercel Cron via vercel.json, or Cloudflare Cron via worker.ts) — sends the 25th-of-month,
// due-day and overdue rent reminders by email + SMS.
// Vercel calls it with "Authorization: Bearer <CRON_SECRET>".
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not set' }, { status: 500 });
  }
  const url = new URL(req.url);
  // Local testing only (never on Vercel production): allow ?secret=… so the job
  // can be opened in a browser, and ?date=YYYY-MM-DD to pretend it's that day
  // (e.g. the 25th) without waiting.
  // APP_ENV (set on Cloudflare) wins; on Vercel fall back to VERCEL_ENV / NODE_ENV.
  const isProd = process.env.APP_ENV
    ? process.env.APP_ENV === 'production'
    : process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  const authed =
    req.headers.get('authorization') === `Bearer ${secret}` ||
    (!isProd && url.searchParams.get('secret') === secret);
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const dateParam = url.searchParams.get('date');
  const now =
    !isProd && dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? new Date(`${dateParam}T09:00:00+05:30`)
      : new Date();
  try {
    const summary = await runRentReminderSweep(now);
    console.log('[cron/rent-reminders]', summary);
    return NextResponse.json({ ok: true, ranFor: now.toISOString(), ...summary });
  } catch (err) {
    console.error('[cron/rent-reminders] failed', err);
    const message =
      err instanceof Error ? err.message : String((err as { message?: unknown })?.message ?? err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
