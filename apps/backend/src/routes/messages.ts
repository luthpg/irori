import { zValidator } from '@hono/zod-validator';
import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/db';
import * as schema from '../db/schema';
import { authMiddleware } from '../middleware/auth';

const postMessageSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  mediaUrl: z.string().optional(),
  replyToId: z.string().optional(),
});

const putMessageSchema = z.object({
  content: z.string().min(1, 'Content is required'),
});

type Bindings = {
  irori_db: D1Database;
  ROOM_SESSION: DurableObjectNamespace;
  FIREBASE_PROJECT_ID?: string;
  TEST_MODE?: string;
};

type Variables = {
  userId: string;
  user: typeof schema.users.$inferSelect;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', authMiddleware());

// Durable Object を通じたブロードキャスト用の共通ヘルパー
async function broadcastToRoom(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  roomId: string,
  payload: { type: string; data: unknown }
) {
  try {
    const doId = c.env.ROOM_SESSION.idFromName(roomId);
    const stub = c.env.ROOM_SESSION.get(doId);

    await stub.fetch(
      new Request('http://internal/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
    );
  } catch (err) {
    console.error(`Failed to broadcast event to room ${roomId}:`, err);
  }
}

// 新規メッセージの投稿
const routes = app
  .post(
    '/rooms/:roomId/messages',
    zValidator('json', postMessageSchema),
    async (c) => {
      const roomId = c.req.param('roomId');
      const userId = c.get('userId');
      const { content, mediaUrl, replyToId } = c.req.valid('json');

      if (!content) {
        return c.json({ error: 'Content is required' }, 400);
      }

      const db = getDb(c.env.irori_db);

      // ルーム所属チェック
      const membership = await db.query.roomMembers.findFirst({
        where: and(
          eq(schema.roomMembers.roomId, roomId),
          eq(schema.roomMembers.userId, userId)
        ),
      });

      if (membership == null) {
        return c.json({ error: 'Forbidden' }, 403);
      }

      const room = await db.query.rooms.findFirst({
        where: eq(schema.rooms.id, roomId),
      });

      if (room == null) {
        return c.json({ error: 'Room not found' }, 404);
      }

      const messageId = crypto.randomUUID();
      const nowStr = new Date().toISOString();

      if (room.isEphemeral) {
        // 一時チャットメッセージ
        await db.insert(schema.ephemeralMessages).values({
          id: messageId,
          roomId,
          userId,
          content,
          mediaUrl,
          replyToId,
          createdAt: nowStr,
        });
      } else {
        // 通常メッセージ
        await db.insert(schema.messages).values({
          id: messageId,
          roomId,
          userId,
          content,
          mediaUrl,
          replyToId,
          createdAt: nowStr,
          updatedAt: nowStr,
        });
      }

      // Durable Objects へブロードキャスト依頼
      await broadcastToRoom(c, roomId, {
        type: 'NEW_MESSAGE',
        data: {
          id: messageId,
          content,
          mediaUrl,
          userId,
          replyToId,
          createdAt: nowStr,
        },
      });

      return c.json({ id: messageId, status: 'saved' }, 201);
    }
  )

  // 送信済みメッセージの事後編集
  .put(
    '/messages/:messageId',
    zValidator('json', putMessageSchema),
    async (c) => {
      const messageId = c.req.param('messageId');
      const userId = c.get('userId');
      const { content } = c.req.valid('json');

      if (!content) {
        return c.json({ error: 'Content is required' }, 400);
      }

      const db = getDb(c.env.irori_db);

      // 1. 通常メッセージテーブルを探索
      let msg:
        | typeof schema.messages.$inferSelect
        | typeof schema.ephemeralMessages.$inferSelect
        | undefined = await db.query.messages.findFirst({
        where: eq(schema.messages.id, messageId),
      });
      let isEphemeral = false;

      // 2. なければ一時メッセージテーブルを探索
      if (msg == null) {
        msg = await db.query.ephemeralMessages.findFirst({
          where: eq(schema.ephemeralMessages.id, messageId),
        });
        isEphemeral = true;
      }

      if (msg == null) {
        return c.json({ error: 'Message not found' }, 404);
      }

      // 投稿者本人のみが編集可能
      if (msg.userId !== userId) {
        return c.json({ error: 'Forbidden' }, 403);
      }

      const nowStr = new Date().toISOString();

      if (isEphemeral) {
        await db
          .update(schema.ephemeralMessages)
          .set({ content })
          .where(eq(schema.ephemeralMessages.id, messageId));
      } else {
        await db
          .update(schema.messages)
          .set({ content, updatedAt: nowStr })
          .where(eq(schema.messages.id, messageId));
      }

      // Durable Objects へブロードキャスト依頼
      await broadcastToRoom(c, msg.roomId, {
        type: 'MESSAGE_EDIT',
        data: {
          id: messageId,
          content,
          updatedAt: nowStr,
        },
      });

      return c.json({ success: true });
    }
  )

  // メッセージの送信取り消し (完全削除)
  .delete('/messages/:messageId', async (c) => {
    const messageId = c.req.param('messageId');
    const userId = c.get('userId');
    const db = getDb(c.env.irori_db);

    // 1. 通常メッセージテーブルを探索
    let msg:
      | typeof schema.messages.$inferSelect
      | typeof schema.ephemeralMessages.$inferSelect
      | undefined = await db.query.messages.findFirst({
      where: eq(schema.messages.id, messageId),
    });
    let isEphemeral = false;

    // 2. 一時メッセージテーブルを探索
    if (msg == null) {
      msg = await db.query.ephemeralMessages.findFirst({
        where: eq(schema.ephemeralMessages.id, messageId),
      });
      isEphemeral = true;
    }

    if (msg == null) {
      return c.json({ error: 'Message not found' }, 404);
    }

    // 投稿者、もしくはそのルームの管理者のみが削除可能
    let isAllowed = false;
    if (msg.userId === userId) {
      isAllowed = true;
    } else {
      const membership = await db.query.roomMembers.findFirst({
        where: and(
          eq(schema.roomMembers.roomId, msg.roomId),
          eq(schema.roomMembers.userId, userId)
        ),
      });
      if (membership != null && membership.role === 'admin') {
        isAllowed = true;
      }
    }

    if (!isAllowed) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    if (isEphemeral) {
      await db
        .delete(schema.ephemeralMessages)
        .where(eq(schema.ephemeralMessages.id, messageId));
    } else {
      await db.delete(schema.messages).where(eq(schema.messages.id, messageId));
    }

    // Durable Objects へブロードキャスト依頼
    await broadcastToRoom(c, msg.roomId, {
      type: 'MESSAGE_DELETE',
      data: {
        id: messageId,
      },
    });

    return c.json({ success: true });
  });

export default routes;
