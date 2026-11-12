import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import type { RequestStatus } from '@prisma/client';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { status } = body;

    const existing = await prisma.privacyRequest.findUnique({
      where: { id },
      include: {
        sender: { select: { phone: true, email: true } },
        receiver: { select: { phone: true, email: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // Only the receiver can ACCEPT or DECLINE; only the sender can CANCEL.
    // Only a PENDING request can change state, and nobody can move it back to
    // PENDING — otherwise contact details revealed on ACCEPT could be re-hidden
    // and re-revealed, or a declined request resurrected.
    const allowed: RequestStatus[] = ['ACCEPTED', 'DECLINED', 'CANCELLED'];
    if (!status || !allowed.includes(status as RequestStatus)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    if (status === 'CANCELLED') {
      if (existing.senderId !== userId) {
        return NextResponse.json({ error: 'Only the sender can cancel this request' }, { status: 403 });
      }
    } else {
      if (existing.receiverId !== userId) {
        return NextResponse.json({ error: 'Only the recipient can respond to this request' }, { status: 403 });
      }
    }
    if (existing.status !== 'PENDING') {
      return NextResponse.json(
        { error: `This request is already ${existing.status.toLowerCase()}.` },
        { status: 409 },
      );
    }

    // Conditional on still being PENDING so concurrent responses can't both win.
    const res = await prisma.privacyRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: status as RequestStatus },
    });
    if (res.count === 0) {
      return NextResponse.json({ error: 'This request was already answered.' }, { status: 409 });
    }
    const updated = await prisma.privacyRequest.findUniqueOrThrow({ where: { id } });

    return NextResponse.json({
      success: true,
      request: updated,
      revealedContact: status === 'ACCEPTED' ? {
        senderPhone: existing.senderPhone,
        senderEmail: existing.senderEmail,
        receiverPhone: existing.receiver.phone,
        receiverEmail: existing.receiver.email,
      } : null,
    });
  } catch (error: any) {
    console.error('Update privacy request error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update request' },
      { status: 500 },
    );
  }
}
