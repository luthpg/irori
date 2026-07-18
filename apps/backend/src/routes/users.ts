import { eq } from 'drizzle-orm';
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

// すべてのルートで認証とユーザー/ゲスト生成を適用
app.use('*', authMiddleware());

const routes = app
  .get('/me', (c) => {
    const user = c.get('user');
    return c.json({
      id: user.id,
      name: user.name,
      statusLamp: user.statusLamp,
    });
  })
  .patch('/status', async (c) => {
    const { statusLamp } = await c.req.json<{
      statusLamp: 'free' | 'busy' | 'away';
    }>();

    if (
      statusLamp !== 'free' &&
      statusLamp !== 'busy' &&
      statusLamp !== 'away'
    ) {
      return c.json({ error: 'Invalid statusLamp value' }, 400);
    }

    const userId = c.get('userId');
    const db = getDb(c.env.irori_db);

    await db
      .update(schema.users)
      .set({ statusLamp })
      .where(eq(schema.users.id, userId));

    return c.json({ success: true });
  });

export default routes;
