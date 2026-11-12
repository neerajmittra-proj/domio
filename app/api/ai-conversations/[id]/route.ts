import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

async function requireChatUser() {
  const session = await auth();
  if (!session?.user) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (session.user.role !== 'OWNER' && session.user.role !== 'MANAGER') {
    return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { userId: session.user.id };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireChatUser();
  if ('response' in g) return g.response;
  const { id } = await params;
  const conversation = await prisma.aiConversation.findFirst({
    where: { id, ownerId: g.userId },
    select: { id: true, title: true, messages: true, updatedAt: true },
  });
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }
  return NextResponse.json({ conversation });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireChatUser();
  if ('response' in g) return g.response;
  const { id } = await params;
  const res = await prisma.aiConversation.deleteMany({
    where: { id, ownerId: g.userId },
  });
  if (res.count === 0) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
