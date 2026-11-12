import { NextResponse } from 'next/server';
import type { AuditEntity } from '@prisma/client';
import { auth } from '@/auth';
import { resolveDataScope } from '@/lib/manager-access';
import { listAuditForEntity } from '@/lib/audit';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ entity: string; entityId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'OWNER' && session.user.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { entity, entityId } = await params;
  if (entity !== 'LEDGER_ENTRY' && entity !== 'RENT_LEDGER') {
    return NextResponse.json({ error: 'Unknown audit entity.' }, { status: 400 });
  }

  const ds = await resolveDataScope(session.user);
  // Scoped by owner (and, for managers, by their accessible units) inside the
  // query — an out-of-scope id simply yields an empty history.
  const entries = await listAuditForEntity(entity as AuditEntity, entityId, {
    ownerId: ds.ownerId,
    subPropertyIds: ds.isManager ? ds.scope.subPropertyIds : undefined,
  });
  return NextResponse.json({ entries });
}
