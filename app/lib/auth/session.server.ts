import { redirect } from 'react-router';
import { getWorkerEnv } from '../../../workers/rpc.server.ts';

export interface AuthSession {
  userId: string;
  memberId: string;
  defaultName: string;
  role: 'admin' | 'member';
  issuedAt: number;
  expiresAt: number;
}

export type AuthSessionInput = Omit<AuthSession, 'issuedAt' | 'expiresAt'>;

const SESSION_COOKIE_NAME = 'irori_session';
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;
const THIRTY_DAYS_MS = THIRTY_DAYS_SECONDS * 1000;
const ROLLING_REFRESH_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(base64Url: string): Uint8Array {
  const padded = base64Url
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(base64Url.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  if (!secret || secret.trim().length < 16) {
    throw new Error(
      'SESSION_SECRET must be configured with at least 16 characters',
    );
  }
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signHmacPayload(
  payloadJson: string,
  secret: string,
): Promise<string> {
  const key = await importHmacKey(secret);
  const payloadBytes = new TextEncoder().encode(payloadJson);
  const payloadB64 = toBase64Url(payloadBytes);
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payloadB64),
  );
  const signatureB64 = toBase64Url(new Uint8Array(signatureBuffer));
  return `${payloadB64}.${signatureB64}`;
}

export async function verifyHmacPayload<T>(
  token: string,
  secret: string,
): Promise<T | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, signatureB64] = parts;
  if (!payloadB64 || !signatureB64) return null;

  try {
    const key = await importHmacKey(secret);
    const sigBytes = fromBase64Url(signatureB64);
    const sigBuffer = sigBytes.buffer.slice(
      sigBytes.byteOffset,
      sigBytes.byteOffset + sigBytes.byteLength,
    ) as ArrayBuffer;
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBuffer,
      new TextEncoder().encode(payloadB64),
    );
    if (!isValid) return null;

    const payloadBytes = fromBase64Url(payloadB64);
    const decodedJson = new TextDecoder().decode(payloadBytes);
    return JSON.parse(decodedJson) as T;
  } catch {
    return null;
  }
}

export async function signSessionToken(
  session: AuthSession,
  secret: string,
): Promise<string> {
  return signHmacPayload(JSON.stringify(session), secret);
}

export async function verifySessionToken(
  token: string,
  secret: string,
  nowMs = Date.now(),
): Promise<AuthSession | null> {
  const parsed = await verifyHmacPayload<Partial<AuthSession>>(token, secret);
  if (!parsed) return null;
  if (
    typeof parsed.userId !== 'string' ||
    !parsed.userId ||
    typeof parsed.memberId !== 'string' ||
    !parsed.memberId ||
    typeof parsed.defaultName !== 'string' ||
    typeof parsed.issuedAt !== 'number' ||
    typeof parsed.expiresAt !== 'number'
  ) {
    return null;
  }
  if (parsed.expiresAt <= nowMs) {
    return null;
  }

  return {
    userId: parsed.userId,
    memberId: parsed.memberId,
    defaultName: parsed.defaultName,
    role: parsed.role === 'member' ? 'member' : 'admin',
    issuedAt: parsed.issuedAt,
    expiresAt: parsed.expiresAt,
  };
}

export function parseCookieValue(
  cookieHeader: string | null,
  cookieName: string,
): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${cookieName}=`));
  if (!match) return null;
  try {
    return decodeURIComponent(match.slice(cookieName.length + 1));
  } catch {
    return null;
  }
}

/**
 * リクエストの Cookie から HMAC-SHA256 署名付きセッションを検証する。
 * フォールバックやデモユーザー偽装は一切行わず、未認証・改ざん・期限切れ時は厳格に null を返す。
 */
export async function verifySessionFromRequest(
  request: Request,
  secretOverride?: string,
): Promise<AuthSession | null> {
  const secret = secretOverride ?? getWorkerEnv()?.SESSION_SECRET;
  if (!secret) return null;

  const rawToken = parseCookieValue(
    request.headers.get('Cookie'),
    SESSION_COOKIE_NAME,
  );
  if (!rawToken) return null;

  return verifySessionToken(rawToken, secret);
}

export async function createSignedSessionCookie(
  sessionInput: AuthSessionInput,
  options?: { secretOverride?: string; isSecure?: boolean; nowMs?: number },
): Promise<string> {
  const secret = options?.secretOverride ?? getWorkerEnv()?.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET is not configured');
  }
  const nowMs = options?.nowMs ?? Date.now();
  const fullSession: AuthSession = {
    ...sessionInput,
    issuedAt: nowMs,
    expiresAt: nowMs + THIRTY_DAYS_MS,
  };
  const token = await signSessionToken(fullSession, secret);
  const secureAttr = options?.isSecure ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${THIRTY_DAYS_SECONDS}${secureAttr}`;
}

export function clearSessionCookie(isSecure = false): string {
  const secureAttr = isSecure ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureAttr}`;
}

export function isSecureRequest(requestOrUrl: Request | string): boolean {
  if (typeof requestOrUrl === 'string') {
    return new URL(requestOrUrl).protocol === 'https:';
  }
  const forwardedProto = requestOrUrl.headers
    .get('X-Forwarded-Proto')
    ?.split(',')[0]
    ?.trim()
    .toLowerCase();
  if (forwardedProto) {
    return forwardedProto === 'https';
  }
  return new URL(requestOrUrl.url).protocol === 'https:';
}

export function getExternalOrigin(requestOrUrl: Request | string): string {
  if (typeof requestOrUrl === 'string') {
    return new URL(requestOrUrl).origin;
  }
  const url = new URL(requestOrUrl.url);
  const proto = isSecureRequest(requestOrUrl) ? 'https:' : url.protocol;
  const forwardedHost = requestOrUrl.headers
    .get('X-Forwarded-Host')
    ?.split(',')[0]
    ?.trim();
  const host = forwardedHost || url.host;
  return `${proto}//${host}`;
}

/**
 * 保護された Loader / Action / API Route 用の認証ガード。
 * 未認証時は UI ルートなら /welcome へリダイレクトし、API ルートなら 401 Unauthorized を投げる。
 * セッション残り有効期限が15日未満の場合は 30日延長用の Set-Cookie ヘッダーを返す。
 */
export async function requireAuth(
  request: Request,
  options?: { redirectTo?: string; isApi?: boolean; secretOverride?: string },
): Promise<{ session: AuthSession; rollingSetCookie: string | null }> {
  const session = await verifySessionFromRequest(
    request,
    options?.secretOverride,
  );
  const url = new URL(request.url);
  const isApi = options?.isApi ?? url.pathname.startsWith('/api/');

  if (!session) {
    if (isApi) {
      throw Response.json(
        { error: 'Unauthorized: Valid session required' },
        { status: 401 },
      );
    }
    throw redirect(options?.redirectTo ?? '/welcome');
  }

  let rollingSetCookie: string | null = null;
  const nowMs = Date.now();
  if (session.expiresAt - nowMs < ROLLING_REFRESH_THRESHOLD_MS) {
    rollingSetCookie = await createSignedSessionCookie(
      {
        userId: session.userId,
        memberId: session.memberId,
        defaultName: session.defaultName,
        role: session.role,
      },
      {
        secretOverride: options?.secretOverride,
        isSecure: isSecureRequest(request),
        nowMs,
      },
    );
  }

  return { session, rollingSetCookie };
}
