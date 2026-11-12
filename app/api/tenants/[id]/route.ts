import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { resolveDataScope } from '@/lib/manager-access';
import { parseTenantInput, managerCanEditTenant } from '@/lib/tenants';
import { deleteTenanciesCascade } from '@/lib/cascade-delete';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const ds = await resolveDataScope(session.user);

  const existing = await prisma.tenant.findFirst({
    where: { id, ownerId: ds.ownerId },
  });

  if (!existing) {
    return NextResponse.json(
      { error: 'Tenant not found or unauthorized' },
      { status: 404 },
    );
  }

  if (ds.isManager && !(await managerCanEditTenant(ds.scope, id))) {
    return NextResponse.json(
      { error: 'Tenant not found or unauthorized' },
      { status: 404 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = parseTenantInput(body);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const updated = await prisma.tenant.update({
      where: { id },
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        location: parsed.data.location,
        nationalId: parsed.data.nationalId,
        emergencyContactName: parsed.data.emergencyContactName,
        emergencyContactPhone: parsed.data.emergencyContactPhone,
        bankAccountNumber: parsed.data.bankAccountNumber,
        bankName: parsed.data.bankName,
      },
      omit: { password: true },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to update tenant' },
      { status: 500 },
    );
  }
}

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

  if (ds.isManager) {
    return NextResponse.json(
      { error: 'Managers cannot delete tenants.' },
      { status: 403 },
    );
  }

  const existing = await prisma.tenant.findFirst({
    where: { id, ownerId: ds.ownerId },
  });

  if (!existing) {
    return NextResponse.json(
      { error: 'Tenant not found or unauthorized' },
      { status: 404 },
    );
  }

  // A tenant with a live lease must have it ended first (otherwise the unit
  // would stay OCCUPIED with no tenant).
  const activeLease = await prisma.tenancy.findFirst({
    where: { tenantId: id, status: 'ACTIVE' },
    select: { id: true },
  });
  if (activeLease) {
    return NextResponse.json(
      { error: 'This tenant has an active lease. Terminate the lease before deleting the tenant.' },
      { status: 409 },
    );
  }

  try {
    if (existing.selfRegistered || existing.userId) {
      // The tenant registered their own account: don't destroy it, just
      // unlink it from this owner.
      await prisma.tenant.update({ where: { id }, data: { ownerId: null } });
      return NextResponse.json({ success: true, unlinked: true });
    }

    // Tenancy history (ledgers etc.) has no ON DELETE CASCADE: remove it first.
    await prisma.$transaction(async (tx) => {
      const tenancies = await tx.tenancy.findMany({
        where: { tenantId: id },
        select: { id: true },
      });
      await deleteTenanciesCascade(tx, tenancies.map((t) => t.id));
      await tx.tenant.delete({ where: { id } });
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to delete tenant' },
      { status: 500 },
    );
  }
}
