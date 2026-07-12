import { desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import * as schema from '../db/schema';

// Bindingsの型定義
type Bindings = {
  irori_db: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get('/:roomId/messages', async (c) => {
  const roomId = c.req.param('roomId');

  // D1バインディングからDrizzleインスタンスを生成（schemaを渡すことで型推論が有効になる）
  const db = drizzle(c.env.irori_db, { schema });

  // ルームの属性を取得
  const room = await db.query.rooms.findFirst({
    where: eq(schema.rooms.id, roomId),
  });

  if (!room) return c.json({ error: 'Room not found' }, 404);

  let resultMessages: Awaited<
    ReturnType<typeof db.query.ephemeralMessages.findFirst>
  >[];

  // 仕様通り、isEphemeralの値によって叩くテーブルを分岐させる
  if (room.isEphemeral) {
    resultMessages = await db.query.ephemeralMessages.findMany({
      where: eq(schema.ephemeralMessages.roomId, roomId),
      orderBy: [desc(schema.ephemeralMessages.createdAt)],
      limit: 50,
    });
  } else {
    resultMessages = await db.query.messages.findMany({
      where: eq(schema.messages.roomId, roomId),
      orderBy: [desc(schema.messages.createdAt)],
      limit: 50,
    });
  }

  return c.json({ messages: resultMessages, nextCursor: null });
});

export default app;
