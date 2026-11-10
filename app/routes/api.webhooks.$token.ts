import type {
  InsertMessageDTO,
  MessageEntity,
  WebhookEntity,
} from '~/lib/schemas';
import { checkRateLimit } from '../../workers/rate-limit.server';
import { callSpaceActor } from '../../workers/rpc.server';
import type { Route } from './+types/api.webhooks.$token';

/**
 * plan.api.md 3.4: /api/webhooks/:token (POST)
 * 外部システムからの Inbound Webhook（E2EE暗号化ペイロード ciphertext, iv を受信し対象チャンネルへ配信）
 * SpaceActor の webhooks テーブルに登録済みのトークンのみを受け付ける。
 */
export async function action({ params, request }: Route.ActionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
  }

  const token = params.token || '';
  if (!token || token.length < 12) {
    return Response.json({ error: 'Invalid webhook token' }, { status: 401 });
  }

  const rate = checkRateLimit(`webhook:${token}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return Response.json(
      { error: 'Too Many Requests: Webhook rate limit exceeded' },
      {
        status: 429,
        headers: { 'Retry-After': String(rate.retryAfterSeconds) },
      },
    );
  }

  try {
    const body = (await request.json()) as {
      spaceId?: string;
      channelId?: string;
      senderName?: string;
      ciphertext?: string;
      iv?: string;
      keyEpoch?: number;
    };

    if (!body.ciphertext || !body.iv) {
      return Response.json(
        { error: 'E2EE ciphertext and iv are required' },
        { status: 400 },
      );
    }

    // トークン形式 `whk_<spaceId>_<hex>` またはリクエストボディの `spaceId` から対象 SpaceActor を特定
    let spaceId = body.spaceId?.trim() || '';
    if (!spaceId && token.startsWith('whk_')) {
      const lastUnderscore = token.lastIndexOf('_');
      if (lastUnderscore > 4) {
        spaceId = token.slice(4, lastUnderscore);
      }
    }

    if (!spaceId) {
      return Response.json(
        { error: 'Unauthorized: Missing spaceId for webhook verification' },
        { status: 401 },
      );
    }

    const verification = await callSpaceActor<
      { valid: false } | { valid: true; webhook: WebhookEntity }
    >(spaceId, 'verifyWebhookToken', { token });

    if (!verification.valid) {
      return Response.json(
        { error: 'Unauthorized: Unregistered or revoked webhook token' },
        { status: 401 },
      );
    }

    const targetChannelId =
      body.channelId?.trim() || verification.webhook.channelId || 'takibi';

    const messageDto: InsertMessageDTO = {
      channelId: targetChannelId,
      senderMemberId: 'mem_webhook_bot',
      senderName:
        body.senderName || `${verification.webhook.label} (Webhook 🤖)`,
      avatarType: 'anon',
      statusLamp: 'free',
      ciphertext: body.ciphertext,
      iv: body.iv,
      keyEpoch: body.keyEpoch ?? 1,
      deliveryMode: 'instant',
    };

    const created = await callSpaceActor<MessageEntity>(
      spaceId,
      'postMessage',
      {
        data: messageDto,
      },
    );

    return Response.json(
      {
        accepted: true,
        messageId: created.id,
        channelId: targetChannelId,
        queuedAt: new Date().toISOString(),
      },
      { status: 202 },
    );
  } catch {
    return Response.json({ error: 'Invalid webhook payload' }, { status: 400 });
  }
}

export async function loader({ params }: Route.LoaderArgs) {
  return Response.json({
    status: 'ready',
    endpoint: `/api/webhooks/${params.token}`,
    e2eeRequired: true,
  });
}
