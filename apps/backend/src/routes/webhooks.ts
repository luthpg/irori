import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '../db/db';
import * as schema from '../db/schema';

type Bindings = {
  irori_db: D1Database;
  ROOM_SESSION: DurableObjectNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

// 注意: Webhook は外部からの呼び出しであるため、通常の authMiddleware はマウントしない
app.post('/:webhookToken', async (c) => {
  const webhookToken = c.req.param('webhookToken');
  const { content } = await c.req.json<{ content: string }>();

  if (!content) {
    return c.json({ error: 'Content is required' }, 400);
  }

  let roomId = '';
  try {
    // webhookToken は安全のため base64 エンコードされた roomId とする
    roomId = atob(webhookToken);
  } catch {
    return c.json({ error: 'Invalid webhook token format' }, 400);
  }

  const db = getDb(c.env.irori_db);

  const room = await db.query.rooms.findFirst({
    where: eq(schema.rooms.id, roomId),
  });

  if (room == null) {
    return c.json({ error: 'Room not found' }, 404);
  }

  const messageId = crypto.randomUUID();
  const nowStr = new Date().toISOString();

  // Bot投稿なので userId は null
  if (room.isEphemeral) {
    await db.insert(schema.ephemeralMessages).values({
      id: messageId,
      roomId,
      userId: null,
      content,
      createdAt: nowStr,
    });
  } else {
    await db.insert(schema.messages).values({
      id: messageId,
      roomId,
      userId: null,
      content,
      createdAt: nowStr,
      updatedAt: nowStr,
    });
  }

  // Durable Objects へブロードキャスト依頼
  try {
    const doId = c.env.ROOM_SESSION.idFromName(roomId);
    const stub = c.env.ROOM_SESSION.get(doId);

    await stub.fetch(
      new Request('http://internal/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'NEW_MESSAGE',
          data: {
            id: messageId,
            content,
            userId: null,
            createdAt: nowStr,
          },
        }),
      })
    );
  } catch (err) {
    console.error(
      `Failed to broadcast webhook message to room ${roomId}:`,
      err
    );
  }

  return c.json({ success: true });
});

export default app;
