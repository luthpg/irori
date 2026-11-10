export interface DurableObjectIdLike {
  toString(): string;
}

export interface DurableObjectStubLike {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface DurableObjectNamespaceLike {
  idFromName(name: string): DurableObjectIdLike;
  get(id: DurableObjectIdLike): DurableObjectStubLike;
}

export interface R2ObjectBodyLike {
  arrayBuffer(): Promise<ArrayBuffer>;
  httpMetadata?: {
    contentType?: string;
  };
  customMetadata?: Record<string, string>;
}

export interface R2BucketLike {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | ReadableStream | Blob,
    options?: {
      httpMetadata?: { contentType?: string; cacheControl?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  delete(keys: string | string[]): Promise<void>;
}

/**
 * worker-configuration.d.ts の `Env` と互換性を持ちつつ、
 * Vitest 等の単体テストモック環境でも安全に注入可能な Worker 環境型定義
 */
export interface IroriWorkerEnv {
  SPACE_ACTOR: DurableObjectNamespaceLike | Env['SPACE_ACTOR'];
  USER_ACTOR: DurableObjectNamespaceLike | Env['USER_ACTOR'];
  CHAT_ROOM?: DurableObjectNamespaceLike | Env['CHAT_ROOM'];
  IRORI_BUCKET?: R2BucketLike | Env['IRORI_BUCKET'];
  SESSION_SECRET?: Env['SESSION_SECRET'];
  IRORI_PEPPER?: Env['IRORI_PEPPER'];
  GOOGLE_CLIENT_ID?: Env['GOOGLE_CLIENT_ID'];
  GOOGLE_CLIENT_SECRET?: Env['GOOGLE_CLIENT_SECRET'];
}

const GLOBAL_ENV_KEY = '__IRORI_WORKER_ENV__';

export function setWorkerEnv(env: IroriWorkerEnv) {
  (globalThis as unknown as Record<string, IroriWorkerEnv>)[GLOBAL_ENV_KEY] =
    env;
}

export function getWorkerEnv(): IroriWorkerEnv | null {
  return (
    (globalThis as unknown as Record<string, IroriWorkerEnv | undefined>)[
      GLOBAL_ENV_KEY
    ] ?? null
  );
}

export function requireWorkerEnv(): IroriWorkerEnv {
  const env = getWorkerEnv();
  if (!env) {
    throw new Error('Cloudflare Worker Env is not initialized');
  }
  return env;
}

/**
 * React Router の Server Loader / Action から SpaceActor (Durable Object) を呼び出す型安全ゲートウェイ
 */
export async function callSpaceActor<T>(
  spaceId: string,
  rpc: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const env = getWorkerEnv();
  if (!env?.SPACE_ACTOR) {
    throw new Error('SPACE_ACTOR binding is not available');
  }
  const ns = env.SPACE_ACTOR as DurableObjectNamespaceLike;
  const id = ns.idFromName(spaceId);
  const stub = ns.get(id);
  const res = await stub.fetch('http://space-actor/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rpc, spaceId, args }),
  });

  if (!res.ok) {
    throw new Error(`SpaceActor RPC [${rpc}] failed with status ${res.status}`);
  }
  return (await res.json()) as T;
}

/**
 * React Router の Server Loader / Action から UserActor (Durable Object) を呼び出す型安全ゲートウェイ
 */
export async function callUserActor<T>(
  userId: string,
  rpc: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const env = getWorkerEnv();
  if (!env?.USER_ACTOR) {
    throw new Error('USER_ACTOR binding is not available');
  }
  const ns = env.USER_ACTOR as DurableObjectNamespaceLike;
  const id = ns.idFromName(userId);
  const stub = ns.get(id);
  const res = await stub.fetch('http://user-actor/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rpc, userId, args }),
  });

  if (!res.ok) {
    throw new Error(`UserActor RPC [${rpc}] failed with status ${res.status}`);
  }
  return (await res.json()) as T;
}
