import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import type { PrivacyRequestType } from '@prisma/client';
import { part2Guard } from '@/lib/features';

export async function POST(req: Request) {
  const disabled = part2Guard();
  if (disabled) return disabled;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

    const senderId = session.user.id;
    const body = await req.json().catch(() => ({}));
    const {
      receiverId,
      receiverRole = 'OWNER',
      requestType = 'RENT_REQUEST',
      propertyId,
      propertyName,
      location,
      propertyType,
      proposedRentOrFee,
      message,
    } = body;

    if (!receiverId) {
      return NextResponse.json({ error: 'Recipient is required.' }, { status: 400 });
    }

    if (senderId === receiverId) {
      return NextResponse.json(
        { error: 'You cannot send a request to yourself.' },
        { status: 400 },
      );
    }

    // Fetch sender user details
    const sender = await prisma.user.findUnique({
      where: { id: senderId },
      select: { name: true, phone: true, email: true, role: true, location: true },
    });

    if (!sender) {
      return NextResponse.json({ error: 'Sender user not found.' }, { status: 404 });
    }

    const validTypes: PrivacyRequestType[] = ['RENT_REQUEST', 'OFFER_RENT', 'HIRE_AGENT'];
    const chosenType: PrivacyRequestType = validTypes.includes(requestType as PrivacyRequestType)
      ? (requestType as PrivacyRequestType)
      : 'RENT_REQUEST';

    // The recipient must be a real, active account. Their name and role come
    // from the database, never from the request body.
    const receiver = await prisma.user.findUnique({
      where: { id: String(receiverId) },
      select: { id: true, name: true, role: true, active: true },
    });
    if (!receiver || !receiver.active) {
      return NextResponse.json({ error: 'Recipient not found.' }, { status: 404 });
    }

    // A referenced property must belong to the recipient (owners) — otherwise
    // the request could attach another owner's listing.
    let linkedPropertyId: string | null = null;
    let linkedPropertyName: string | null = null;
    if (propertyId) {
      const prop = await prisma.property.findFirst({
        where: { id: String(propertyId), ownerId: receiver.id },
        select: { id: true, name: true },
      });
      if (prop) {
        linkedPropertyId = prop.id;
        linkedPropertyName = prop.name;
      }
    }

    const fee =
      proposedRentOrFee !== undefined && proposedRentOrFee !== null && proposedRentOrFee !== ''
        ? Number(proposedRentOrFee)
        : null;
    if (fee !== null && (!Number.isFinite(fee) || fee < 0)) {
      return NextResponse.json({ error: 'Proposed amount must be a positive number.' }, { status: 400 });
    }

    // Don't let one user spam the same recipient with identical open requests.
    const duplicate = await prisma.privacyRequest.findFirst({
      where: {
        senderId,
        receiverId: receiver.id,
        requestType: chosenType,
        propertyId: linkedPropertyId,
        status: 'PENDING',
      },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: 'You already have a pending request to this recipient.' },
        { status: 409 },
      );
    }

    const newRequest = await prisma.privacyRequest.create({
      data: {
        requestType: chosenType,
        senderId,
        senderRole: sender.role,
        senderName: sender.name,
        senderPhone: sender.phone || 'Not provided',
        senderEmail: sender.email,
        receiverId: receiver.id,
        receiverRole: receiver.role === 'AGENT' ? 'AGENT' : String(receiverRole).toUpperCase() === 'TENANT' ? 'TENANT' : 'OWNER',
        receiverName: receiver.name,
        propertyId: linkedPropertyId,
        propertyName: linkedPropertyName ?? (propertyName ? String(propertyName).slice(0, 200) : null),
        location: String(location || sender.location || 'Not specified').slice(0, 200),
        propertyType: propertyType ? String(propertyType).slice(0, 100) : null,
        proposedRentOrFee: fee,
        message: message ? String(message).trim().slice(0, 1000) : null,
        status: 'PENDING',
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Request sent successfully with privacy protection! Your contact details will be shared once the request is accepted.',
        request: newRequest,
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error('Privacy request create error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to send request' },
      { status: 500 },
    );
  }
}

export async function GET() {
  const disabled = part2Guard();
  if (disabled) return disabled;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    const [received, sent] = await Promise.all([
      prisma.privacyRequest.findMany({
        where: { receiverId: userId },
        orderBy: { createdAt: 'desc' },
        include: {
          sender: {
            select: { id: true, name: true, location: true, role: true },
          },
          property: {
            select: { id: true, name: true, customType: true, city: true },
          },
        },
      }),
      prisma.privacyRequest.findMany({
        where: { senderId: userId },
        orderBy: { createdAt: 'desc' },
        include: {
          receiver: {
            select: { id: true, name: true, location: true, role: true, phone: true, email: true },
          },
          property: {
            select: { id: true, name: true, customType: true, city: true },
          },
        },
      }),
    ]);

    // Mask contact details if status is not ACCEPTED
    const formattedReceived = received.map((r) => {
      const isAccepted = r.status === 'ACCEPTED';
      return {
        id: r.id,
        requestType: r.requestType,
        senderId: r.senderId,
        senderName: r.senderName,
        senderRole: r.senderRole,
        senderLocation: r.sender.location,
        senderPhone: isAccepted ? r.senderPhone : '🔒 Hidden until accepted',
        senderEmail: isAccepted ? r.senderEmail : '🔒 Hidden until accepted',
        location: r.location,
        propertyType: r.propertyType,
        propertyName: r.propertyName || r.property?.name,
        propertyId: r.propertyId,
        proposedRentOrFee: r.proposedRentOrFee,
        message: r.message,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      };
    });

    const formattedSent = sent.map((s) => {
      const isAccepted = s.status === 'ACCEPTED';
      return {
        id: s.id,
        requestType: s.requestType,
        receiverId: s.receiverId,
        receiverName: s.receiverName,
        receiverRole: s.receiverRole,
        receiverLocation: s.receiver.location,
        receiverPhone: isAccepted ? (s.receiver.phone || 'Not provided') : '🔒 Hidden until accepted',
        receiverEmail: isAccepted ? s.receiver.email : '🔒 Hidden until accepted',
        location: s.location,
        propertyType: s.propertyType,
        propertyName: s.propertyName || s.property?.name,
        propertyId: s.propertyId,
        proposedRentOrFee: s.proposedRentOrFee,
        message: s.message,
        status: s.status,
        createdAt: s.createdAt.toISOString(),
      };
    });

    return NextResponse.json({
      received: formattedReceived,
      sent: formattedSent,
      pendingCount: received.filter((r) => r.status === 'PENDING').length,
    });
  } catch (error: any) {
    console.error('Privacy request get error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch requests' },
      { status: 500 },
    );
  }
}
