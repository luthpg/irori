const IDB_NAME = 'irori_e2ee_keystore_v1';
const STORE_NAME = 'crypto_keys';

// IndexedDB が利用できない環境（Vitest / SSR）用のインメモリキャッシュ
const memoryKeystore = new Map<string, unknown>();

function openKeystoreDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetKey<T = CryptoKey>(
  keyName: string,
): Promise<T | null> {
  if (typeof indexedDB === 'undefined') {
    return (memoryKeystore.get(keyName) as T | undefined) ?? null;
  }
  const db = await openKeystoreDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(keyName);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSetKey<T = CryptoKey>(
  keyName: string,
  value: T,
): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    memoryKeystore.set(keyName, value);
    return;
  }
  const db = await openKeystoreDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(value, keyName);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlToBytes(b64Url: string): Uint8Array {
  const padded = b64Url
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(b64Url.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * FR-KEY-01: 端末ローカル鍵管理の初期化
 * 1. navigator.storage.persist() によりモバイルブラウザ (ITP) の自動パージを防止
 * 2. ユーザーの ECDH P-256 鍵ペア (秘密鍵は extractable: false) を生成・保持
 * 3. 個人ブックマーク二重隔離用の UserMasterKey (AES-GCM 256bit, extractable: false) を生成・保持
 */
export async function ensureLocalIdentityKeys(): Promise<{
  publicKeyJwk: string;
  isPersisted: boolean;
}> {
  let isPersisted = false;
  if (
    typeof navigator !== 'undefined' &&
    navigator.storage &&
    typeof navigator.storage.persist === 'function'
  ) {
    try {
      isPersisted = await navigator.storage.persist();
    } catch {
      isPersisted = false;
    }
  }

  let publicKeyJwk = await idbGetKey<string>('user_ecdh_public_jwk');
  const existingPriv = await idbGetKey<CryptoKey>('user_ecdh_private_key');

  if (!existingPriv || !publicKeyJwk) {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      false, // extractable: false (XSSによる秘密鍵抽出を暗号学的に遮断)
      ['deriveKey', 'deriveBits'],
    );
    const exportedPub = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    publicKeyJwk = btoa(JSON.stringify(exportedPub));
    await idbSetKey('user_ecdh_private_key', keyPair.privateKey);
    await idbSetKey('user_ecdh_public_jwk', publicKeyJwk);
  }

  const existingUmk = await idbGetKey<CryptoKey>('user_personal_master_key');
  if (!existingUmk) {
    const umk = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false, // extractable: false
      ['encrypt', 'decrypt'],
    );
    await idbSetKey('user_personal_master_key', umk);
  }

  return { publicKeyJwk, isPersisted };
}

export async function getOrInitPersonalMasterKey(): Promise<CryptoKey> {
  await ensureLocalIdentityKeys();
  const key = await idbGetKey<CryptoKey>('user_personal_master_key');
  if (key) return key;

  const fallback = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  await idbSetKey('user_personal_master_key', fallback);
  return fallback;
}

/**
 * 新規スペース作成時: CSPRNG で 256bit スペースマスターキー (SMK) を生成し、
 * - 招待URLフラグメント用の Base64Url 文字列 (`inviteKeyFragment`)
 * - ユーザーの個人鍵でラップした `wrappedSpaceKey`
 * - IndexedDB への `extractable: false` CryptoKey 保存
 * を行う。
 */
export async function generateNewSpaceMasterKey(
  spaceId: string,
  keyEpoch = 1,
): Promise<{
  smk: CryptoKey;
  inviteKeyFragment: string;
  wrappedSpaceKey: string;
}> {
  const rawBytes = new Uint8Array(32);
  crypto.getRandomValues(rawBytes);
  const inviteKeyFragment = bytesToBase64Url(rawBytes);

  const rawBuffer = rawBytes.buffer.slice(
    rawBytes.byteOffset,
    rawBytes.byteOffset + rawBytes.byteLength,
  ) as ArrayBuffer;

  const smk = await crypto.subtle.importKey(
    'raw',
    rawBuffer,
    { name: 'AES-GCM', length: 256 },
    false, // extractable: false
    ['encrypt', 'decrypt'],
  );

  const umk = await getOrInitPersonalMasterKey();
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  const wrappedBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: wrapIv as unknown as BufferSource },
    umk,
    rawBuffer,
  );
  const wrappedSpaceKey = `umk_wrap_v1:${bytesToBase64Url(wrapIv)}.${bytesToBase64Url(new Uint8Array(wrappedBuf))}`;

  await idbSetKey(`smk_${spaceId}_ep${keyEpoch}`, smk);
  await idbSetKey(`smk_fragment_${spaceId}_ep${keyEpoch}`, inviteKeyFragment);

  return { smk, inviteKeyFragment, wrappedSpaceKey };
}

/**
 * 招待リンク `/join/:spaceId#key=<Base64Url_SMK>` から受け取った鍵フラグメントを
 * IndexedDB へ `extractable: false` でインポートし、同時に自身の個人鍵でラップした `wrappedSpaceKey` を返す。
 */
export async function importSpaceMasterKeyFromFragment(
  spaceId: string,
  inviteKeyFragment: string,
  keyEpoch = 1,
): Promise<{ smk: CryptoKey; wrappedSpaceKey: string }> {
  const rawBytes = base64UrlToBytes(inviteKeyFragment.trim());
  if (rawBytes.byteLength !== 32) {
    throw new Error('Invalid Space Master Key length (expected 256-bit)');
  }

  const rawBuffer = rawBytes.buffer.slice(
    rawBytes.byteOffset,
    rawBytes.byteOffset + rawBytes.byteLength,
  ) as ArrayBuffer;

  const smk = await crypto.subtle.importKey(
    'raw',
    rawBuffer,
    { name: 'AES-GCM', length: 256 },
    false, // extractable: false
    ['encrypt', 'decrypt'],
  );

  const umk = await getOrInitPersonalMasterKey();
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  const wrappedBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: wrapIv as unknown as BufferSource },
    umk,
    rawBuffer,
  );
  const wrappedSpaceKey = `umk_wrap_v1:${bytesToBase64Url(wrapIv)}.${bytesToBase64Url(new Uint8Array(wrappedBuf))}`;

  await idbSetKey(`smk_${spaceId}_ep${keyEpoch}`, smk);
  await idbSetKey(
    `smk_fragment_${spaceId}_ep${keyEpoch}`,
    inviteKeyFragment.trim(),
  );

  return { smk, wrappedSpaceKey };
}

export async function getStoredInviteKeyFragment(
  spaceId: string,
  keyEpoch = 1,
): Promise<string | null> {
  return idbGetKey<string>(`smk_fragment_${spaceId}_ep${keyEpoch}`);
}

/**
 * 招待リンク生成用: IndexedDB の `smk_fragment_*` または `wrappedSpaceKey` から招待フラグメントを取得する。
 */
export async function resolveInviteKeyFragment(
  spaceId: string,
  keyEpoch = 1,
  wrappedSpaceKey?: string,
): Promise<string | null> {
  const existing = await getStoredInviteKeyFragment(spaceId, keyEpoch);
  if (existing) return existing;

  if (wrappedSpaceKey?.startsWith('umk_wrap_v1:')) {
    try {
      const payload = wrappedSpaceKey.slice('umk_wrap_v1:'.length);
      const [ivB64, cipherB64] = payload.split('.');
      if (ivB64 && cipherB64) {
        const umk = await getOrInitPersonalMasterKey();
        const ivBytes = base64UrlToBytes(ivB64);
        const cipherBytes = base64UrlToBytes(cipherB64);
        const rawBuf = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: ivBytes as unknown as BufferSource },
          umk,
          cipherBytes as unknown as BufferSource,
        );
        const fragment = bytesToBase64Url(new Uint8Array(rawBuf));
        await importSpaceMasterKeyFromFragment(spaceId, fragment, keyEpoch);
        return fragment;
      }
    } catch {
      // unwrap failed
    }
  }

  return null;
}

export async function exportSpaceKeyFragmentsForSync(
  spaces: { spaceId: string; keyEpoch?: number }[],
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  for (const s of spaces) {
    const ep = s.keyEpoch ?? 1;
    const frag = await getStoredInviteKeyFragment(s.spaceId, ep);
    if (frag) {
      map[`${s.spaceId}:ep${ep}`] = frag;
    }
  }
  return map;
}

export async function importSpaceKeyFragmentsFromSync(
  fragments: Record<string, string>,
): Promise<number> {
  let count = 0;
  for (const [key, frag] of Object.entries(fragments)) {
    const [spaceId, epPart] = key.split(':ep');
    const epoch = Number(epPart || '1') || 1;
    if (spaceId && frag) {
      try {
        await importSpaceMasterKeyFromFragment(spaceId, frag, epoch);
        count += 1;
      } catch {
        // ignore invalid entry
      }
    }
  }
  return count;
}

/**
 * スペースマスターキー (SMK: AES-GCM 256bit) を IndexedDB から取得、
 * 未登録の場合は決定論的フォールバック鍵を PBKDF2 導出して extractable: false で保存する。
 */
export async function getOrInitSpaceMasterKey(
  spaceId: string,
  keyEpoch = 1,
): Promise<CryptoKey> {
  const cacheId = `smk_${spaceId}_ep${keyEpoch}`;
  const cached = await idbGetKey<CryptoKey>(cacheId);
  if (cached) return cached;

  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(`irori_smk_seed_${spaceId}_epoch_${keyEpoch}`),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  const smk = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(`irori_space_salt_${spaceId}`),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false, // extractable: false
    ['encrypt', 'decrypt'],
  );

  await idbSetKey(cacheId, smk);
  return smk;
}
