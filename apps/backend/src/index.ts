import { lt } from 'drizzle-orm';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getDb } from './db/db';
import * as schema from './db/schema';
import friends from './routes/friends';
import media from './routes/media';
import messages from './routes/messages';
import rooms from './routes/rooms';
import users from './routes/users';
import webhooks from './routes/webhooks';

// Durable Object をエクスポート（Wrangler が検知するため）
export { RoomSession } from './ws/RoomSession';

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

app.use(
  '*',
  cors({
    origin: (origin) => origin,
    credentials: true,
  })
);

// 単一のメソッドチェーンで全ルートを結合し、型推論を平坦化
const routes = app
  .get('/', (c) => c.text('ok', 200))
  .route('/api/v1/users', users)
  .route('/api/v1/friends', friends)
  .route('/api/v1/rooms', rooms)
  .route('/api/v1', messages)
  .route('/api/v1/media', media)
  .route('/api/v1/webhooks', webhooks)
  .get('/ws/rooms/:roomId', async (c) => {
    const roomId = c.req.param('roomId');
    const id = c.env.ROOM_SESSION.idFromName(roomId);
    const stub = c.env.ROOM_SESSION.get(id);

    // Durable Object へ WebSocket 接続リクエストをフォワード
    return stub.fetch(c.req.raw);
  });

export type AppType = typeof routes;

// Fetch と Scheduled（一時チャット自動消滅 Cron）ハンドラをエクスポート
export default {
  fetch: app.fetch,
  async scheduled(_event: unknown, env: Bindings, _ctx: unknown) {
    const db = getDb(env.irori_db);
    const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    try {
      await db
        .delete(schema.ephemeralMessages)
        .where(lt(schema.ephemeralMessages.createdAt, threshold));
      console.log('Successfully cleaned up expired ephemeral messages.');
    } catch (err) {
      console.error('Failed to cleanup ephemeral messages:', err);
    }
  },
};
