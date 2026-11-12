import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { canRollback } from '@/lib/import/import-types';
import { rollbackImport, RollbackNotAllowedError } from '@/lib/import/import-processor';

export const runtime = 'nodejs';
export const maxDuration = 120;

// Undo a completed import: deletes only the rows that import created (tracked
// in ImportedRecord), in one transaction, within the rollback window.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireOwner();
  if ('response' in guard) return guard.response;
  const ownerId = guard.session.user.id;
  const { id } = await params;

  const job = await prisma.importJob.findFirst({
    where: { id, ownerId },
    select: { id: true, status: true, confirmedAt: true },
  });
  if (!job) {
    return NextResponse.json({ error: 'Import not found.' }, { status: 404 });
  }
  if (!canRollback(job)) {
    return NextResponse.json(
      {
        error:
          job.status === 'COMPLETED'
            ? 'This import is older than 30 days and can no longer be rolled back.'
            : 'Only completed imports can be rolled back.',
      },
      { status: 409 },
    );
  }

  try {
    const { deleted } = await rollbackImport(job.id, ownerId);
    return NextResponse.json({ success: true, deleted });
  } catch (err) {
    if (err instanceof RollbackNotAllowedError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error('Import rollback failed:', err);
    // Typically a foreign-key violation: imported rows have since been used.
    return NextResponse.json(
      {
        error:
          'Could not roll back: some imported records are now used by other data (for example new payments or units). Nothing was changed.',
      },
      { status: 409 },
    );
  }
}
