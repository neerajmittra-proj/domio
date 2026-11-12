import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const MAX_MESSAGES = 200;
const MAX_BYTES = 2_000_000;

// Saved Ask Domi threads are private to the user who created them.
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

export async function GET() {
  const g = await requireChatUser();
  if ('response' in g) return g.response;
  const conversations = await prisma.aiConversation.findMany({
    where: { ownerId: g.userId },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    select: { id: true, title: true, updatedAt: true },
  });
  return NextResponse.json({ conversations });
}

// Create a conversation, or update it when `id` is supplied.
export async function POST(request: Request) {
  const g = await requireChatUser();
  if ('response' in g) return g.response;

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: 'messages are required.' }, { status: 400 });
  }
  if (body.messages.length > MAX_MESSAGES) {
    return NextResponse.json({ error: 'Conversation is too long to save.' }, { status: 413 });
  }
  const messages = body.messages as unknown[];
  if (JSON.stringify(messages).length > MAX_BYTES) {
    return NextResponse.json({ error: 'Conversation is too large to save.' }, { status: 413 });
  }
  const title =
    typeof body.title === 'string' && body.title.trim()
      ? body.title.trim().slice(0, 120)
      : 'New chat';

  try {
    if (typeof body.id === 'string' && body.id) {
      // Scoped by owner: another user's conversation id is simply "not found".
      const res = await prisma.aiConversation.updateMany({
        where: { id: body.id, ownerId: g.userId },
        data: { messages: messages as any, title },
      });
      if (res.count === 0) {
        return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
      }
      return NextResponse.json({ conversation: { id: body.id, title } });
    }
    const created = await prisma.aiConversation.create({
      data: { ownerId: g.userId, title, messages: messages as any },
      select: { id: true, title: true },
    });
    return NextResponse.json({ conversation: created }, { status: 201 });
  } catch (err) {
    console.error('Failed to save conversation:', err);
    return NextResponse.json({ error: 'Failed to save conversation.' }, { status: 500 });
  }
}
