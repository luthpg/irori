import type { IroriWorkerEnv } from '../../../workers/rpc.server.ts';
import {
  getExternalOrigin,
  isSecureRequest,
  parseCookieValue,
  signHmacPayload,
  verifyHmacPayload,
} from './session.server.ts';

const OAUTH_STATE_COOKIE_NAME = 'irori_oauth_state';
const OAUTH_STATE_MAX_AGE_SECONDS = 600; // 10分

interface OAuthStatePayload {
  state: string;
  codeVerifier: string;
  returnTo: string;
  expiresAt: number;
}

export interface GoogleUserInfo {
  sub: string;
  name: string;
  picture?: string;
  email?: string;
}

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

function generateRandomBase64Url(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

async function computeS256CodeChallenge(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(codeVerifier),
  );
  return toBase64Url(new Uint8Array(digest));
}

export function buildGoogleCallbackUri(requestOrUrl: Request | string): string {
  return `${getExternalOrigin(requestOrUrl)}/auth/google/callback`;
}

/**
 * Google OAuth 2.0 Authorization Code + PKCE (S256) の認可URLと署名付き state Cookie を生成する。
 * 開発用バイパスやフォールバックは一切持たず、本番・検証・ローカルで同一コードパスを実行する。
 */
export async function createGoogleAuthorizationUrl(params: {
  env: IroriWorkerEnv;
  requestUrl: Request | string;
  returnTo?: string;
}): Promise<{ authorizationUrl: string; stateCookieHeader: string }> {
  const { env, requestUrl, returnTo = '/' } = params;

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured in .dev.vars or wrangler secrets',
    );
  }
  if (!env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET must be configured');
  }

  const state = generateRandomBase64Url(24);
  const codeVerifier = generateRandomBase64Url(32);
  const codeChallenge = await computeS256CodeChallenge(codeVerifier);
  const redirectUri = buildGoogleCallbackUri(requestUrl);

  const statePayload: OAuthStatePayload = {
    state,
    codeVerifier,
    returnTo: returnTo.startsWith('/') ? returnTo : '/',
    expiresAt: Date.now() + OAUTH_STATE_MAX_AGE_SECONDS * 1000,
  };

  const signedState = await signHmacPayload(
    JSON.stringify(statePayload),
    env.SESSION_SECRET,
  );
  const isSecure = isSecureRequest(requestUrl);
  const secureAttr = isSecure ? '; Secure' : '';
  const stateCookieHeader = `${OAUTH_STATE_COOKIE_NAME}=${encodeURIComponent(signedState)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${OAUTH_STATE_MAX_AGE_SECONDS}${secureAttr}`;

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('access_type', 'online');
  authUrl.searchParams.set('prompt', 'select_account');

  return {
    authorizationUrl: authUrl.toString(),
    stateCookieHeader,
  };
}

export function clearOAuthStateCookie(isSecure = false): string {
  const secureAttr = isSecure ? '; Secure' : '';
  return `${OAUTH_STATE_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureAttr}`;
}

/**
 * Google OAuth 2.0 コールバックを検証し、認可コードをトークンおよびユーザープロフィールと交換する。
 */
export async function exchangeGoogleCodeForUser(params: {
  env: IroriWorkerEnv;
  request: Request;
}): Promise<{ user: GoogleUserInfo; returnTo: string }> {
  const { env, request } = params;
  if (
    !env.GOOGLE_CLIENT_ID ||
    !env.GOOGLE_CLIENT_SECRET ||
    !env.SESSION_SECRET
  ) {
    throw new Error('OAuth environment variables are not configured');
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) {
    throw new Error('Missing OAuth code or state parameter');
  }

  const rawStateCookie = parseCookieValue(
    request.headers.get('Cookie'),
    OAUTH_STATE_COOKIE_NAME,
  );
  if (!rawStateCookie) {
    throw new Error('Missing OAuth state cookie');
  }

  const statePayload = await verifyHmacPayload<OAuthStatePayload>(
    rawStateCookie,
    env.SESSION_SECRET,
  );
  if (
    !statePayload ||
    statePayload.state !== state ||
    statePayload.expiresAt <= Date.now()
  ) {
    throw new Error('Invalid or expired OAuth state');
  }

  const redirectUri = buildGoogleCallbackUri(request);
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      code_verifier: statePayload.codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    throw new Error(
      `Google token exchange failed with status ${tokenRes.status}`,
    );
  }

  const tokenData = (await tokenRes.json()) as { access_token?: string };
  if (!tokenData.access_token) {
    throw new Error('Google token response did not include access_token');
  }

  const userRes = await fetch(
    'https://openidconnect.googleapis.com/v1/userinfo',
    {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    },
  );

  if (!userRes.ok) {
    throw new Error(`Google userinfo failed with status ${userRes.status}`);
  }

  const userInfo = (await userRes.json()) as Partial<GoogleUserInfo>;
  if (!userInfo.sub || typeof userInfo.sub !== 'string') {
    throw new Error('Invalid Google userinfo payload');
  }

  return {
    user: {
      sub: userInfo.sub,
      name: userInfo.name || 'Irori User',
      picture: userInfo.picture,
      email: userInfo.email,
    },
    returnTo: statePayload.returnTo || '/',
  };
}
