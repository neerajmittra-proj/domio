import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { resolveDataScope } from '@/lib/manager-access';
import { toggleTenantReminderSettings, sendSingleRentReminder } from '@/lib/rent-reminders';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'OWNER' && session.user.role !== 'MANAGER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const ds = await resolveDataScope(session.user);
    const { id } = await params;
    if (ds.isManager && !ds.scope.tenantIds.includes(id)) {
      return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 });
    }
    const body = await request.json().catch(() => ({}));
    const { enabled, daysBefore } = body;

    const result = await toggleTenantReminderSettings({
      tenantId: id,
      enabled: Boolean(enabled),
      daysBefore: daysBefore !== undefined ? Number(daysBefore) : undefined,
      ownerId: ds.ownerId,
    });
    if (!result.success) {
      return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to update reminder settings' },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'OWNER' && session.user.role !== 'MANAGER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const ds = await resolveDataScope(session.user);
    const { id } = await params;
    if (ds.isManager && !ds.scope.tenantIds.includes(id)) {
      return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 });
    }
    const result = await sendSingleRentReminder({
      tenantId: id,
      manual: true,
      ownerId: ds.ownerId,
    });
    if (!result.success && !result.stopped) {
      return NextResponse.json(
        { ...result, error: result.message },
        { status: result.message === 'Tenant not found.' ? 404 : 422 },
      );
    }
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to send reminder' },
      { status: 500 },
    );
  }
}
