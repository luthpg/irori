import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, gte, lt } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/db';
import * as schema from '../db/schema';
import { authMiddleware } from '../middleware/auth';

const patchSettingsSchema = z.object({
  isReadVisible: z.boolean().optional(),
  isTypingVisible: z.boolean().optional(),
  isThreadEnabled: z.boolean().optional(),
  isMentionEnabled: z.boolean().optional(),
});

const getMessagesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => Math.min(Number(v || '50'), 100)),
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

type RoomSettings = {
  isReadVisible: boolean;
  isTypingVisible: boolean;
  isThreadEnabled: boolean;
  isMentionEnabled: boolean;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', authMiddleware());

// 自分が参加しているルーム一覧の取得
const routes = app
  .get('/', async (c) => {
    const userId = c.get('userId');
    const db = getDb(c.env.irori_db);

    const memberships = await db.query.roomMembers.findMany({
      where: eq(schema.roomMembers.userId, userId),
    });

    const roomIds = memberships.map((m) => m.roomId);

    if (roomIds.length === 0) {
      return c.json({ rooms: [] });
    }

    const userRooms = await db.query.rooms.findMany({
      where: (rooms, { inArray }) => inArray(rooms.id, roomIds),
    });

    return c.json({
      rooms: userRooms.map((r) => ({
        id: r.id,
        name: r.name,
        isEphemeral: r.isEphemeral,
      })),
    });
  })

  // 新しいルーム（囲炉裏）の作成
  .post('/', async (c) => {
    const { name, isEphemeral } = await c.req.json<{
      name: string;
      isEphemeral: boolean;
    }>();

    if (!name) {
      return c.json({ error: 'Room name is required' }, 400);
    }

    const userId = c.get('userId');
    const db = getDb(c.env.irori_db);
    const roomId = crypto.randomUUID();

    // D1バッチングで1回のリクエストにまとめて実行
    await db.batch([
      db.insert(schema.rooms).values({
        id: roomId,
        name,
        isEphemeral,
      }),
      db.insert(schema.roomMembers).values({
        roomId,
        userId,
        role: 'admin', // ルーム作成者は管理者
      }),
      db.insert(schema.roomSettings).values({
        roomId,
        isReadVisible: true,
        isTypingVisible: true,
        isThreadEnabled: true,
        isMentionEnabled: true,
      }),
    ]);

    return c.json(
      {
        id: roomId,
        name,
        isEphemeral,
      },
      201
    );
  })

  // 特定ルームの詳細および設定の取得
  .get('/:roomId', async (c) => {
    const roomId = c.req.param('roomId');
    const userId = c.get('userId');
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

    // Relationsの with を使用して、ルーム、設定、およびメンバー情報を1クエリで同時取得
    const room = await db.query.rooms.findFirst({
      where: eq(schema.rooms.id, roomId),
      with: {
        settings: true,
        members: {
          with: {
            user: true,
          },
        },
      },
    });

    if (room == null) {
      return c.json({ error: 'Room not found' }, 404);
    }

    const defaultSettings: RoomSettings = {
      isReadVisible: true,
      isTypingVisible: true,
      isThreadEnabled: true,
      isMentionEnabled: true,
    };

    return c.json({
      id: room.id,
      name: room.name,
      isEphemeral: room.isEphemeral,
      settings: room.settings
        ? {
            isReadVisible: room.settings.isReadVisible,
            isTypingVisible: room.settings.isTypingVisible,
            isThreadEnabled: room.settings.isThreadEnabled,
            isMentionEnabled: room.settings.isMentionEnabled,
          }
        : defaultSettings,
      members: room.members.map((m) => ({
        userId: m.userId,
        role: m.role,
        name: m.user.name,
        statusLamp: m.user.statusLamp,
      })),
    });
  })

  // ルーム機能のトグル設定切り替え
  .patch(
    '/:roomId/settings',
    zValidator('json', patchSettingsSchema),
    async (c) => {
      const roomId = c.req.param('roomId');
      const userId = c.get('userId');
      const body = c.req.valid('json');
      const db = getDb(c.env.irori_db);

      // 管理者チェック
      const membership = await db.query.roomMembers.findFirst({
        where: and(
          eq(schema.roomMembers.roomId, roomId),
          eq(schema.roomMembers.userId, userId)
        ),
      });

      if (membership == null || membership.role !== 'admin') {
        return c.json({ error: 'Only admins can modify settings' }, 403);
      }

      const updateFields: Record<string, boolean> = {};
      if (body.isReadVisible !== undefined)
        updateFields.isReadVisible = body.isReadVisible;
      if (body.isTypingVisible !== undefined)
        updateFields.isTypingVisible = body.isTypingVisible;
      if (body.isThreadEnabled !== undefined)
        updateFields.isThreadEnabled = body.isThreadEnabled;
      if (body.isMentionEnabled !== undefined)
        updateFields.isMentionEnabled = body.isMentionEnabled;

      if (Object.keys(updateFields).length === 0) {
        return c.json({ error: 'No settings provided to update' }, 400);
      }

      await db
        .update(schema.roomSettings)
        .set(updateFields)
        .where(eq(schema.roomSettings.roomId, roomId));

      return c.json({ success: true });
    }
  )

  // ルームへの招待トークン生成
  .post('/:roomId/invite', async (c) => {
    const roomId = c.req.param('roomId');
    const userId = c.get('userId');
    const db = getDb(c.env.irori_db);

    // ルーム所属メンバーのみが招待を生成可能
    const membership = await db.query.roomMembers.findFirst({
      where: and(
        eq(schema.roomMembers.roomId, roomId),
        eq(schema.roomMembers.userId, userId)
      ),
    });

    if (membership == null) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24時間

    await db.insert(schema.roomInvitations).values({
      id: token,
      roomId,
      inviterId: userId,
      expiresAt,
    });

    return c.json({ token });
  })

  // 招待トークンを用いた新規入室
  .post('/join', async (c) => {
    const { token } = await c.req.json<{ token: string }>();
    const userId = c.get('userId');
    const db = getDb(c.env.irori_db);

    const invitation = await db.query.roomInvitations.findFirst({
      where: eq(schema.roomInvitations.id, token),
    });

    if (invitation == null) {
      return c.json({ error: 'Invalid or expired token' }, 400);
    }

    if (new Date(invitation.expiresAt) < new Date()) {
      return c.json({ error: 'Token expired' }, 400);
    }

    // メンバーとして登録
    await db
      .insert(schema.roomMembers)
      .values({
        roomId: invitation.roomId,
        userId,
        role: 'member',
      })
      .onConflictDoNothing();

    return c.json({ success: true });
  })

  // タイムラインメッセージの取得
  .get(
    '/:roomId/messages',
    zValidator('query', getMessagesQuerySchema),
    async (c) => {
      const roomId = c.req.param('roomId');
      const userId = c.get('userId');
      const { cursor, limit } = c.req.valid('query');

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

      let resultMessages: (
        | typeof schema.messages.$inferSelect
        | typeof schema.ephemeralMessages.$inferSelect
      )[] = [];

      if (room.isEphemeral) {
        // 一時チャット: 24時間以内のメッセージのみ表示
        const threshold = new Date(
          Date.now() - 24 * 60 * 60 * 1000
        ).toISOString();

        resultMessages = await db
          .select()
          .from(schema.ephemeralMessages)
          .where(
            and(
              eq(schema.ephemeralMessages.roomId, roomId),
              gte(schema.ephemeralMessages.createdAt, threshold),
              cursor
                ? lt(schema.ephemeralMessages.createdAt, cursor)
                : undefined
            )
          )
          .orderBy(desc(schema.ephemeralMessages.createdAt))
          .limit(limit + 1);
      } else {
        // 通常チャット
        resultMessages = await db
          .select()
          .from(schema.messages)
          .where(
            and(
              eq(schema.messages.roomId, roomId),
              cursor ? lt(schema.messages.createdAt, cursor) : undefined
            )
          )
          .orderBy(desc(schema.messages.createdAt))
          .limit(limit + 1);
      }

      let nextCursor: string | null = null;
      if (resultMessages.length > limit) {
        const nextItem = resultMessages[limit - 1];
        nextCursor = nextItem.createdAt;
        resultMessages = resultMessages.slice(0, limit);
      }

      return c.json({
        messages: resultMessages,
        nextCursor,
      });
    }
  );

export default routes;
