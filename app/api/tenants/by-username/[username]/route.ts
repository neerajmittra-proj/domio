import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Looking up other users' personal details is an owner-only action.
  if (session.user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { username } = await params;
  const clean = username.trim().toLowerCase().replace(/^@/, '');

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { username: clean },
      select: {
        id: true,
        username: true,
        name: true,
        phone: true,
        email: true,
        location: true,
        ownerId: true,
      },
    });

    if (!tenant) {
      return NextResponse.json(
        { error: `No registered tenant found with handle "@${clean}".` },
        { status: 404 },
      );
    }

    if (tenant.ownerId && tenant.ownerId !== session.user.id) {
      return NextResponse.json(
        { error: `@${clean} is already linked to another owner.` },
        { status: 409 },
      );
    }

    const { ownerId: _ownerId, ...safe } = tenant;
    return NextResponse.json({ tenant: safe });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to find tenant' },
      { status: 500 },
    );
  }
}
