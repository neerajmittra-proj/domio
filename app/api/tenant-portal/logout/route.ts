import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { TENANT_JWT_COOKIE } from '@/lib/tenant-otp';
import { part2Guard } from '@/lib/features';

export async function POST() {
  const disabled = part2Guard();
  if (disabled) return disabled;
  const cookieStore = await cookies();
  cookieStore.delete(TENANT_JWT_COOKIE);
  return NextResponse.json({ success: true });
}
