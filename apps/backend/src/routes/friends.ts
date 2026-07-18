import { eq, inArray, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '../db/db';
import * as schema from '../db/schema';
import { authMiddleware } from '../middleware/auth';

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

const routes = app
  // フレンド一覧取得
  .get('/', async (c) => {
    const userId = c.get('userId');
    const db = getDb(c.env.irori_db);

    // 自身が関与しているフレンド接続をすべて検索
    const connections = await db.query.friendConnections.findMany({
      where: or(
        eq(schema.friendConnections.userIdA, userId),
        eq(schema.friendConnections.userIdB, userId)
      ),
    });

    const friendIds = connections.map((conn) =>
      conn.userIdA === userId ? conn.userIdB : conn.userIdA
    );

    if (friendIds.length === 0) {
      return c.json({ friends: [] });
    }

    // 相手のユーザー詳細情報を取得
    const friendUsers = await db.query.users.findMany({
      where: inArray(schema.users.id, friendIds),
    });

    return c.json({
      friends: friendUsers.map((u) => ({
        id: u.id,
        name: u.name,
        statusLamp: u.statusLamp,
      })),
    });
  })

  // 招待コードの生成
  .post('/invite-code', async (c) => {
    const userId = c.get('userId');
    const db = getDb(c.env.irori_db);

    const inviteCode = crypto.randomUUID();

    await db.insert(schema.friendInvitations).values({
      id: inviteCode,
      inviterId: userId,
    });

    return c.json({ inviteCode });
  })

  // 招待コードを使用したフレンド接続
  .post('/connect', async (c) => {
    const { inviteCode } = await c.req.json<{ inviteCode: string }>();
    const userId = c.get('userId');
    const db = getDb(c.env.irori_db);

    const invitation = await db.query.friendInvitations.findFirst({
      where: eq(schema.friendInvitations.id, inviteCode),
    });

    if (invitation == null) {
      return c.json({ error: 'Invalid invite code' }, 404);
    }

    if (invitation.inviterId === userId) {
      return c.json({ error: 'Cannot connect to yourself' }, 400);
    }

    // データベース側の `user_id_a < user_id_b` 制約を満たすようにソートして格納
    const [userIdA, userIdB] = [userId, invitation.inviterId].sort();

    await db
      .insert(schema.friendConnections)
      .values({
        userIdA,
        userIdB,
      })
      .onConflictDoNothing();

    return c.json({ success: true });
  });

export default routes;
