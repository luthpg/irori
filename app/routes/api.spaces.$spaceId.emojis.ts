import { requireAuth } from '~/lib/auth/session.server';
import type { CustomEmojiEntity } from '~/lib/schemas';
import {
  callSpaceActor,
  getWorkerEnv,
  type R2BucketLike,
} from '../../workers/rpc.server';
import type { Route } from './+types/api.spaces.$spaceId.emojis';

const MAX_EMOJI_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export async function loader({ params, request }: Route.LoaderArgs) {
  await requireAuth(request, { isApi: true });
  const spaceId = params.spaceId;
  if (!spaceId) {
    return Response.json({ error: 'Missing spaceId' }, { status: 400 });
  }
  const emojis = await callSpaceActor<CustomEmojiEntity[]>(
    spaceId,
    'getCustomEmojis',
  );
  return Response.json(emojis);
}

export async function action({ params, request }: Route.ActionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
  }

  const { session, rollingSetCookie } = await requireAuth(request, {
    isApi: true,
  });
  const spaceId = params.spaceId;
  if (!spaceId) {
    return Response.json({ error: 'Missing spaceId' }, { status: 400 });
  }

  const contentType = request.headers.get('Content-Type') || '';
  const emojiId = `ce_${Date.now().toString(36)}`;
  let shortcode = ':hearth:';
  let label = 'カスタムスタンプ';
  let previewChar = '🔥';
  let imageUrl = `/api/media/emojis-${spaceId}-${emojiId}`;

  if (contentType.includes('application/json')) {
    const body = (await request.json()) as {
      name?: string;
      shortcode?: string;
      label?: string;
      previewChar?: string;
    };
    shortcode = body.shortcode || body.name || ':hearth:';
    label = body.label || 'カスタムスタンプ';
    previewChar = body.previewChar || '🔥';
  } else {
    const formData = await request.formData();
    shortcode = String(
      formData.get('name') || formData.get('shortcode') || ':hearth:',
    );
    label = String(formData.get('label') || 'カスタムスタンプ');
    previewChar = String(formData.get('previewChar') || '🔥');

    const file = formData.get('file');
    if (file instanceof File) {
      if (file.size > MAX_EMOJI_SIZE_BYTES) {
        return Response.json(
          { error: 'File exceeds the 5MB limit' },
          { status: 413 },
        );
      }

      const env = getWorkerEnv();
      const bucket = env?.IRORI_BUCKET as R2BucketLike | undefined;
      if (bucket) {
        const r2Key = `emojis-${spaceId}-${emojiId}`;
        const buf = await file.arrayBuffer();
        await bucket.put(r2Key, buf, {
          httpMetadata: {
            contentType: file.type || 'image/png',
            cacheControl: 'public, max-age=31536000, immutable',
          },
          customMetadata: {
            spaceId,
            shortcode,
            uploadedBy: session.userId,
          },
        });
        imageUrl = `/api/media/${r2Key}`;
      }
    }
  }

  const created = await callSpaceActor<CustomEmojiEntity>(
    spaceId,
    'addCustomEmoji',
    {
      id: emojiId,
      shortcode,
      label,
      previewChar,
      imageUrl,
      uploadedBy: session.defaultName,
    },
  );

  return Response.json(created, {
    status: 201,
    headers: rollingSetCookie ? { 'Set-Cookie': rollingSetCookie } : undefined,
  });
}
