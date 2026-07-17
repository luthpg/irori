import { eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { getDb } from '../db/db';
import * as schema from '../db/schema';

export const authMiddleware = (): MiddlewareHandler<{
  Bindings: { irori_db: D1Database };
  Variables: {
    userId: string;
    user: typeof schema.users.$inferSelect;
  };
}> => {
  return async (c, next) => {
    const db = getDb(c.env.irori_db);

    // 1. Authorization ヘッダーまたは Cookie から userId を取得
    let userId = '';
    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      userId = authHeader.substring(7).trim();
    } else {
      // Hono のヘルパーを使わずに Cookie を簡易取得、または c.req.header('Cookie') からパース
      const cookieHeader = c.req.header('Cookie');
      if (cookieHeader) {
        const cookies = cookieHeader.split(';').reduce(
          (acc, cookie) => {
            const [key, val] = cookie.trim().split('=');
            if (key) acc[key] = val || '';
            return acc;
          },
          {} as Record<string, string>
        );
        if (cookies.userId) {
          userId = cookies.userId;
        }
      }
    }

    let user: typeof schema.users.$inferSelect | undefined;

    if (userId) {
      // DB からユーザーを検索
      user = await db.query.users.findFirst({
        where: eq(schema.users.id, userId),
      });
    }

    // 2. ユーザーが存在しない、または userId が指定されていない場合はゲストを自動作成
    if (user == null) {
      const newUserId = userId || `guest_${crypto.randomUUID()}`;
      const guestName = `Guest_${newUserId.slice(-4)}`;

      await db
        .insert(schema.users)
        .values({
          id: newUserId,
          name: guestName,
          statusLamp: 'free',
        })
        .onConflictDoNothing();

      // 挿入後に再取得
      user = await db.query.users.findFirst({
        where: eq(schema.users.id, newUserId),
      });

      if (user == null) {
        throw new Error('Failed to create guest user');
      }
    }

    // 3. コンテキストにセット
    c.set('userId', user.id);
    c.set('user', user);

    await next();
  };
};
