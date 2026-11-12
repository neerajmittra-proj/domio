import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { resolveDataScope } from '@/lib/manager-access';
import { Prisma } from '@prisma/client';
import { deletePropertiesCascade } from '@/lib/cascade-delete';
import type { PropertyType, PropertyStatus } from '@prisma/client';

const VALID_TYPES: PropertyType[] = ['RESIDENTIAL', 'COMMERCIAL', 'MIXED', 'INDUSTRIAL'];
const VALID_STATUSES: PropertyStatus[] = ['ACTIVE', 'VACANT', 'MAINTENANCE'];
const VALID_GROUP_BY = ['custom', 'floor', 'status', 'rent'];
// Display-only layout preferences; any manager who can see the property may
// persist these. Everything else needs EDIT access.
const PREF_FIELDS = ['unitsExpanded', 'unitsGroupBy', 'unitSections'];

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

  const existing = await prisma.property.findFirst({
    where: { id, ownerId: ds.ownerId },
  });

  if (!existing || (ds.isManager && !ds.scope.propertyIds.includes(id))) {
    return NextResponse.json(
      { error: 'Property not found or unauthorized' },
      { status: 404 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Managers: VIEW-only grants may only save layout preferences.
  if (
    ds.isManager &&
    !ds.scope.editPropertyIds.has(id) &&
    Object.keys(body).some((k) => !PREF_FIELDS.includes(k))
  ) {
    return NextResponse.json(
      { error: 'You have view-only access to this property.' },
      { status: 403 },
    );
  }

  const {
    name,
    address,
    city,
    country,
    type,
    customType,
    status,
    listingStatus,
    images,
    notes,
    unitsExpanded,
    unitsGroupBy,
    unitSections,
  } = body;

  if (name !== undefined && (typeof name !== 'string' || name.trim().length < 2)) {
    return NextResponse.json(
      { error: 'Property name must be at least 2 characters.' },
      { status: 400 },
    );
  }
  for (const [label, v] of [['Address', address], ['City', city], ['Country', country]] as const) {
    if (v !== undefined && (typeof v !== 'string' || !v.trim())) {
      return NextResponse.json({ error: `${label} cannot be empty.` }, { status: 400 });
    }
  }
  if (type !== undefined && !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Invalid property type.' }, { status: 400 });
  }
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid property status.' }, { status: 400 });
  }
  if (unitsExpanded !== undefined && typeof unitsExpanded !== 'boolean') {
    return NextResponse.json({ error: 'unitsExpanded must be a boolean.' }, { status: 400 });
  }
  if (unitsGroupBy !== undefined && !VALID_GROUP_BY.includes(unitsGroupBy)) {
    return NextResponse.json({ error: 'Invalid unitsGroupBy.' }, { status: 400 });
  }
  if (unitSections !== undefined && unitSections !== null && !Array.isArray(unitSections)) {
    return NextResponse.json({ error: 'unitSections must be an array.' }, { status: 400 });
  }

  try {
    const updated = await prisma.property.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(address !== undefined ? { address: address.trim() } : {}),
        ...(city !== undefined ? { city: city.trim() } : {}),
        ...(country !== undefined ? { country: country.trim() } : {}),
        ...(type !== undefined ? { type: type as PropertyType } : {}),
        ...(customType !== undefined ? { customType: customType ? String(customType).trim() : null } : {}),
        ...(status !== undefined ? { status: status as PropertyStatus } : {}),
        ...(unitsExpanded !== undefined ? { unitsExpanded } : {}),
        ...(unitsGroupBy !== undefined ? { unitsGroupBy } : {}),
        ...(unitSections !== undefined
          ? { unitSections: unitSections === null ? Prisma.JsonNull : unitSections }
          : {}),
        ...(listingStatus ? { listingStatus: String(listingStatus) } : {}),
        ...(images !== undefined && Array.isArray(images) ? { images: images.slice(0, 5).map(String) } : {}),
        ...(notes !== undefined ? { notes: notes ? String(notes).trim() : null } : {}),
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to update property' },
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
      { error: 'Managers cannot delete properties.' },
      { status: 403 },
    );
  }

  const existing = await prisma.property.findFirst({
    where: { id, ownerId: ds.ownerId },
  });

  if (!existing) {
    return NextResponse.json(
      { error: 'Property not found or unauthorized' },
      { status: 404 },
    );
  }

  try {
    // No ON DELETE CASCADE in the schema: remove units, tenancies + ledgers,
    // utilities, expenses and access grants first, atomically.
    await prisma.$transaction(
      (tx) => deletePropertiesCascade(tx, [id]),
      { timeout: 60000, maxWait: 10000 },
    );
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to delete property' },
      { status: 500 },
    );
  }
}
