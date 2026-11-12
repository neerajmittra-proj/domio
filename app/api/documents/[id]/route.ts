import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { resolveDataScope, resolveEditAccess } from '@/lib/manager-access';
import { deleteFromR2 } from '@/lib/r2';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const ds = await resolveDataScope(session.user);

  const doc = await prisma.document.findUnique({
    where: { id },
    select: { id: true, ownerId: true, fileKey: true, entityType: true, entityId: true },
  });
  if (!doc || doc.ownerId !== ds.ownerId) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  if (ds.isManager) {
    if (doc.entityType === 'PORTFOLIO' || doc.entityType === 'TENANT') {
      return NextResponse.json(
        { error: 'Managers cannot delete documents at this level.' },
        { status: 403 },
      );
    }
    const access = await resolveEditAccess(session.user, {
      propertyId: doc.entityType === 'PROPERTY' ? doc.entityId : undefined,
      subPropertyId: doc.entityType === 'SUB_PROPERTY' ? doc.entityId : undefined,
    });
    if ('error' in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
  }

  try {
    // Remove the record first: if this fails nothing is lost, whereas deleting
    // the stored file first could leave a record pointing at a missing file.
    await prisma.document.delete({ where: { id } });
    await deleteFromR2(doc.fileKey).catch((err) => {
      // Storage cleanup is best-effort — an orphaned object is harmless.
      console.warn('Failed to delete file from R2 (continuing):', err);
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Failed to delete document:', err);
    return NextResponse.json(
      { error: 'Failed to delete document. Please try again.' },
      { status: 500 },
    );
  }
}
