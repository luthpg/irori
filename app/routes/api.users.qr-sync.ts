import { requireAuth } from '~/lib/auth/session.server';
import type { QrSyncSessionEntity } from '~/lib/schemas';
import { callUserActor } from '../../workers/rpc.server';
import type { Route } from './+types/api.users.qr-sync';

/**
 * FR-KEY-03: 端末間 QR P2P 一時鍵交換リレー API
 * - GET /api/users/qr-sync?sessionId=... : 新端末がセッション状態と暗号化鍵バンドルをポーリング取得
 * - POST /api/users/qr-sync (intent: 'create' | 'approve') :
 *     - 'create': 新端末が一時 ECDH P-256 公開鍵を登録
 *     - 'approve': 既存端末が新端末の公開鍵と ECDH 共有鍵を導出し、AES-GCM でラップした鍵バンドルを中継保存
 */
export async function loader({ request }: Route.LoaderArgs) {
  const { session, rollingSetCookie } = await requireAuth(request, {
    isApi: true,
  });
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId') || '';
  if (!sessionId) {
    return Response.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  const res = await callUserActor<{ session: QrSyncSessionEntity | null }>(
    session.userId,
    'getQrSyncSession',
    { sessionId },
  );

  return Response.json(res, {
    headers: rollingSetCookie ? { 'Set-Cookie': rollingSetCookie } : undefined,
  });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
  }

  const { session, rollingSetCookie } = await requireAuth(request, {
    isApi: true,
  });
  const body = (await request.json()) as {
    intent?: 'create' | 'approve';
    sessionId?: string;
    ephemeralPublicKey?: string;
    expiresAt?: string;
    senderPublicKey?: string;
    encryptedKeyBundle?: string;
    iv?: string;
  };

  if (!body.sessionId) {
    return Response.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  if (body.intent === 'approve') {
    if (!body.senderPublicKey || !body.encryptedKeyBundle || !body.iv) {
      return Response.json(
        {
          error:
            'senderPublicKey, encryptedKeyBundle, and iv are required to approve QR sync',
        },
        { status: 400 },
      );
    }

    const res = await callUserActor<{
      ok: boolean;
      session: QrSyncSessionEntity | null;
    }>(session.userId, 'approveQrSyncSession', {
      sessionId: body.sessionId,
      senderPublicKey: body.senderPublicKey,
      encryptedKeyBundle: body.encryptedKeyBundle,
      iv: body.iv,
    });

    if (!res.ok) {
      return Response.json(
        { error: 'QR session not found or expired', session: res.session },
        { status: 410 },
      );
    }

    return Response.json(res, {
      headers: rollingSetCookie
        ? { 'Set-Cookie': rollingSetCookie }
        : undefined,
    });
  }

  if (!body.ephemeralPublicKey) {
    return Response.json(
      { error: 'Missing ephemeralPublicKey' },
      { status: 400 },
    );
  }

  const created = await callUserActor<QrSyncSessionEntity>(
    session.userId,
    'createQrSyncSession',
    {
      sessionId: body.sessionId,
      ephemeralPublicKey: body.ephemeralPublicKey,
      expiresAt: body.expiresAt,
    },
  );

  return Response.json(
    { ok: true, session: created },
    {
      status: 201,
      headers: rollingSetCookie
        ? { 'Set-Cookie': rollingSetCookie }
        : undefined,
    },
  );
}
