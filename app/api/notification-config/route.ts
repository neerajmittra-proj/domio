import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getOrCreateNotificationConfig, parseConfigInput } from '@/lib/notification-config';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Notification preferences belong to the owner account, not individual
  // managers — a manager reads their owner's settings (only owners edit).
  if (session.user.role !== 'OWNER' && session.user.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const ownerId = session.user.role === 'MANAGER'
    ? (await prisma.user.findUnique({ where: { id: session.user.id }, select: { ownerId: true } }))?.ownerId
    : session.user.id;
  if (!ownerId) {
    return NextResponse.json({ error: 'Owner not found.' }, { status: 404 });
  }
  const config = await getOrCreateNotificationConfig(ownerId);
  return NextResponse.json({ config });
}

// The settings UI saves with PATCH; POST is kept as an alias for older callers.
export async function PATCH(request: Request) {
  return POST(request);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'OWNER') {
    return NextResponse.json(
      { error: 'Only property owners can change notification settings.' },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const data = parseConfigInput(body);
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  try {
    await getOrCreateNotificationConfig(session.user.id);
    const config = await prisma.notificationConfig.update({
      where: { ownerId: session.user.id },
      data,
    });
    return NextResponse.json({ config });
  } catch (err) {
    console.error('Failed to update notification config:', err);
    return NextResponse.json(
      { error: 'Failed to save settings. Please try again.' },
      { status: 500 },
    );
  }
}
