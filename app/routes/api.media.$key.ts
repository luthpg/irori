import { requireAuth } from '~/lib/auth/session.server';
import { checkRateLimit } from '../../workers/rate-limit.server';
import { getWorkerEnv, type R2BucketLike } from '../../workers/rpc.server';
import type { Route } from './+types/api.media.$key';

const MAX_MEDIA_SIZE_BYTES = 5 * 1024 * 1024; // 5MB 上限 (Cloudflare R2 Free Tier 保護)

export async function loader({ params, request }: Route.LoaderArgs) {
  await requireAuth(request, { isApi: true });

  const key = params.key;
  if (!key || !/^[a-zA-Z0-9._-]+$/.test(key)) {
    return Response.json({ error: 'Invalid media key' }, { status: 400 });
  }

  const env = getWorkerEnv();
  const bucket = env?.IRORI_BUCKET as R2BucketLike | undefined;
  if (!bucket) {
    return Response.json(
      { error: 'R2 bucket is not configured' },
      { status: 503 },
    );
  }

  const object = await bucket.get(key);
  if (!object) {
    return Response.json({ error: 'Media not found' }, { status: 404 });
  }

  const buffer = await object.arrayBuffer();
  const headers = new Headers();
  headers.set(
    'Content-Type',
    object.httpMetadata?.contentType || 'application/octet-stream',
  );
  headers.set('Cache-Control', 'private, max-age=3600');
  if (object.customMetadata?.iv) {
    headers.set('X-Irori-Iv', object.customMetadata.iv);
  }

  return new Response(buffer, { status: 200, headers });
}

export async function action({ params, request }: Route.ActionArgs) {
  if (request.method !== 'PUT' && request.method !== 'POST') {
    return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
  }

  const { session, rollingSetCookie } = await requireAuth(request, {
    isApi: true,
  });

  const rate = checkRateLimit(`media_upload:${session.userId}`, {
    limit: 15,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return Response.json(
      { error: 'Too Many Requests: Media upload rate limit exceeded' },
      {
        status: 429,
        headers: { 'Retry-After': String(rate.retryAfterSeconds) },
      },
    );
  }

  const key = params.key;
  if (!key || !/^[a-zA-Z0-9._-]+$/.test(key)) {
    return Response.json({ error: 'Invalid media key' }, { status: 400 });
  }

  const contentLengthHeader = request.headers.get('Content-Length');
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (!Number.isNaN(contentLength) && contentLength > MAX_MEDIA_SIZE_BYTES) {
      return Response.json(
        { error: 'Payload Too Large: Maximum file size is 5MB' },
        { status: 413 },
      );
    }
  }

  const arrayBuffer = await request.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    return Response.json({ error: 'Empty payload' }, { status: 400 });
  }
  if (arrayBuffer.byteLength > MAX_MEDIA_SIZE_BYTES) {
    return Response.json(
      { error: 'Payload Too Large: Maximum file size is 5MB' },
      { status: 413 },
    );
  }

  const env = getWorkerEnv();
  const bucket = env?.IRORI_BUCKET as R2BucketLike | undefined;
  if (!bucket) {
    return Response.json(
      { error: 'R2 bucket is not configured' },
      { status: 503 },
    );
  }

  const contentType =
    request.headers.get('X-Irori-Original-Type') ||
    request.headers.get('Content-Type') ||
    'application/octet-stream';
  const iv = request.headers.get('X-Irori-Iv') || '';
  const spaceId = request.headers.get('X-Irori-Space-Id') || '';

  await bucket.put(key, arrayBuffer, {
    httpMetadata: {
      contentType,
      cacheControl: 'private, max-age=3600',
    },
    customMetadata: {
      iv,
      spaceId,
      uploadedBy: session.userId,
    },
  });

  return Response.json(
    {
      key,
      url: `/api/media/${key}`,
      sizeBytes: arrayBuffer.byteLength,
      iv,
    },
    {
      status: 201,
      headers: rollingSetCookie
        ? { 'Set-Cookie': rollingSetCookie }
        : undefined,
    },
  );
}
