import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { processTemplateImport, ImportDataError } from '@/lib/import/template-importer';
import type { TemplateData } from '@/lib/import/template-schema';

export const runtime = 'nodejs';
export const maxDuration = 120;

// Commit a previously parsed template (ImportJob) to the owner's data in a
// single transaction. The job is claimed atomically so a double click or a
// second tab cannot import it twice.
export async function POST(request: Request) {
  const guard = await requireOwner();
  if ('response' in guard) return guard.response;
  const ownerId = guard.session.user.id;

  const body = await request.json().catch(() => null);
  const jobId = body && typeof body.jobId === 'string' ? body.jobId : '';
  if (!jobId) {
    return NextResponse.json({ error: 'jobId is required.' }, { status: 400 });
  }

  const job = await prisma.importJob.findFirst({
    where: { id: jobId, ownerId },
    select: { id: true, status: true, mappedData: true, errorRows: true },
  });
  if (!job) {
    return NextResponse.json({ error: 'Import not found.' }, { status: 404 });
  }
  if (job.errorRows > 0) {
    return NextResponse.json(
      { error: 'This file has errors. Fix them in the template and upload it again.' },
      { status: 422 },
    );
  }
  if (job.status !== 'READY_TO_IMPORT' || !job.mappedData) {
    return NextResponse.json(
      { error: 'This import is not ready to run (it may already have been imported).' },
      { status: 409 },
    );
  }

  const claimed = await prisma.importJob.updateMany({
    where: { id: job.id, ownerId, status: 'READY_TO_IMPORT' },
    data: { status: 'IMPORTING' },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: 'This import is already running.' }, { status: 409 });
  }

  try {
    const summary = await processTemplateImport(
      job.id,
      ownerId,
      job.mappedData as unknown as TemplateData,
    );
    return NextResponse.json({ success: true, summary });
  } catch (err) {
    const userError = err instanceof ImportDataError;
    if (!userError) console.error('Template import failed:', err);
    const message = userError
      ? (err as Error).message
      : 'The import failed and no data was saved. Please try again.';
    await prisma.importJob
      .update({ where: { id: job.id }, data: { status: 'FAILED', errorMessage: message.slice(0, 500) } })
      .catch(() => {});
    return NextResponse.json({ error: message }, { status: userError ? 422 : 500 });
  }
}
