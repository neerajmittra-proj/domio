import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// One-time, idempotent schema updates (rent-reminder log columns + new
// property / sub-unit enum values), run from the
// server (Cloudflare/Vercel can reach Neon even when a local network can't).
// Same result as `prisma db push` for these two columns + indexes; safe to run
// again (IF NOT EXISTS). Protected by CRON_SECRET. Remove once applied.
export const dynamic = 'force-dynamic';

const STATEMENTS = [
  `ALTER TABLE "RentReminder" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'MANUAL'`,
  `ALTER TABLE "RentReminder" ADD COLUMN IF NOT EXISTS "rentLedgerId" TEXT`,
  `CREATE INDEX IF NOT EXISTS "RentReminder_tenancyId_kind_idx" ON "RentReminder"("tenancyId", "kind")`,
  `CREATE INDEX IF NOT EXISTS "RentReminder_rentLedgerId_kind_idx" ON "RentReminder"("rentLedgerId", "kind")`,
  // New property types (Apartment, Bungalow, ...) and sub-unit types (Flat, Portion, ...)
  ...['APARTMENT', 'BUNGALOW', 'INDEPENDENT_HOUSE', 'PG_HOSTEL', 'SHOP_SHOWROOM', 'OFFICE_BUILDING', 'WAREHOUSE', 'LAND'].map(
    (v) => `ALTER TYPE "PropertyType" ADD VALUE IF NOT EXISTS '${v}'`,
  ),
  ...['FLAT', 'PORTION', 'SHOP', 'PARKING', 'STORAGE'].map(
    (v) => `ALTER TYPE "RentableEntityType" ADD VALUE IF NOT EXISTS '${v}'`,
  ),
];

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const done: string[] = [];
  try {
    for (const sql of STATEMENTS) {
      await prisma.$executeRawUnsafe(sql);
      done.push(sql);
    }
    const cols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name::text AS column_name FROM information_schema.columns WHERE table_name = 'RentReminder' AND column_name IN ('kind','rentLedgerId')`,
    );
    return NextResponse.json({ ok: true, applied: done.length, columns: cols.map((c) => c.column_name) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, applied: done.length, error: message }, { status: 500 });
  }
}
