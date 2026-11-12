import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { resolveDataScope } from '@/lib/manager-access';
import { sendAllOwnerRentReminders, sendSingleRentReminder } from '@/lib/rent-reminders';

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.user.role !== 'OWNER' && session.user.role !== 'MANAGER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const ds = await resolveDataScope(session.user);

    const body = await req.json().catch(() => ({}));
    const { tenantId } = body;

    // If specific tenant requested
    if (tenantId) {
      if (typeof tenantId !== 'string') {
        return NextResponse.json({ error: 'Invalid tenantId.' }, { status: 400 });
      }
      if (ds.isManager && !ds.scope.tenantIds.includes(tenantId)) {
        return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 });
      }
      const result = await sendSingleRentReminder({
        tenantId,
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
    }

    // Bulk monthly dispatch for all active tenants of this owner (or, for a
    // manager, of the units they can access).
    const summary = await sendAllOwnerRentReminders(
      ds.ownerId,
      ds.isManager ? ds.scope.tenantIds : undefined,
    );
    return NextResponse.json({
      success: true,
      message: `Dispatched ${summary.totalSent} rent reminders (${summary.totalSkipped} skipped per owner settings).`,
      summary,
    });
  } catch (error: any) {
    console.error('Rent reminders trigger error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to dispatch reminders' },
      { status: 500 },
    );
  }
}
