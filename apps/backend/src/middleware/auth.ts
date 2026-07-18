import { eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';
import { getDb } from '../db/db';
import * as schema from '../db/schema';

// Firebase Auth Public Key JWKS URL
const JWKS_URL =
  'https://www.googleapis.com/robot/v1/metadata/jwk/securetoken@system.gserviceaccount.com';
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;

const getJWKS = () => {
  if (!jwksCache) {
    jwksCache = createRemoteJWKSet(new URL(JWKS_URL));
  }
  return jwksCache;
};

export const authMiddleware = (): MiddlewareHandler<{
  Bindings: {
    irori_db: D1Database;
    FIREBASE_PROJECT_ID?: string;
    TEST_MODE?: string;
  };
  Variables: {
    userId: string;
    user: typeof schema.users.$inferSelect;
  };
}> => {
  return async (c, next) => {
    const db = getDb(c.env.irori_db);
    const projectId = c.env.FIREBASE_PROJECT_ID;

    // 1. Authorization ヘッダーまたは Cookie からトークンを取得
    let token = '';
    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else {
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
          token = cookies.userId;
        }
      }
    }

    let user: typeof schema.users.$inferSelect | undefined;
    let decodedUid: string | null = null;
    let decodedName: string | null = null;

    if (token) {
      const isJwt = token.includes('.');
      const isTestEnv =
        (typeof process !== 'undefined' && process.env.VITEST === 'true') ||
        c.env.TEST_MODE === 'true';

      if (isJwt) {
        try {
          if (projectId && !isTestEnv) {
            // 本番/ステージング環境：Firebase JWT をリモート鍵で署名検証
            const { payload } = await jwtVerify(token, getJWKS(), {
              issuer: `https://securetoken.google.com/${projectId}`,
              audience: projectId,
            });
            decodedUid = payload.sub ?? null;
            decodedName = (payload.name as string) ?? null;
          } else {
            // テスト環境または Firebase Project ID 未設定時：検証をスキップしてデコード
            const payload = decodeJwt(token);
            decodedUid = payload.sub ?? null;
            decodedName = (payload.name as string) ?? null;
          }
        } catch (err) {
          console.error('JWT Verification Error:', err);
          return c.json({ error: 'Unauthorized: Invalid token' }, 401);
        }
      } else {
        // JWTではない場合（従来のUUIDやテストID）
        decodedUid = token;
      }
    }

    if (decodedUid) {
      // 1. まず googleOauthId で検索
      user = await db.query.users.findFirst({
        where: eq(schema.users.googleOauthId, decodedUid),
      });

      // 2. 見つからなければ id で検索
      if (!user) {
        user = await db.query.users.findFirst({
          where: eq(schema.users.id, decodedUid),
        });
      }
    }

    // ユーザーが存在しない、またはトークンが無い場合は新規登録
    if (user == null) {
      const newUserId = decodedUid || `guest_${crypto.randomUUID()}`;
      const guestName = decodedName || `Guest_${newUserId.slice(-4)}`;
      const googleOauthId = token?.includes('.') ? decodedUid : null;

      await db
        .insert(schema.users)
        .values({
          id: newUserId,
          name: guestName,
          googleOauthId: googleOauthId,
          statusLamp: 'free',
        })
        .onConflictDoNothing();

      // 挿入後に再取得
      user = await db.query.users.findFirst({
        where: eq(schema.users.id, newUserId),
      });

      if (user == null) {
        throw new Error('Failed to create user');
      }
    }

    c.set('userId', user.id);
    c.set('user', user);

    await next();
  };
};
