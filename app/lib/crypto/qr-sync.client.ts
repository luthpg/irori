import {
  idbGetKey,
  idbSetKey,
  importSpaceKeyFragmentsFromSync,
} from './e2ee.client.ts';

export interface QrSyncSession {
  sessionId: string;
  ephemeralPublicKeyJwk: string;
  qrPayloadString: string;
  expiresAt: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * FR-KEY-03: かんたん引き継ぎ ＆ サブ端末ログインQRコード
 * 新端末上でワンタイム ECDH (P-256) キーペアを生成し、QRコード用ペイロードを構築する。
 */
export async function createQrSyncSession(): Promise<QrSyncSession> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false, // 秘密鍵は extractable: false
    ['deriveKey', 'deriveBits'],
  );

  const pubJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const pubBase64 = btoa(JSON.stringify(pubJwk));
  const sessionId = `qrs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  await idbSetKey('qr_ephemeral_private_key', keyPair.privateKey);
  await idbSetKey('qr_ephemeral_public_jwk', pubBase64);

  const qrPayloadString = `irori://qr-sync?sid=${encodeURIComponent(sessionId)}&pub=${encodeURIComponent(pubBase64)}`;

  return {
    sessionId,
    ephemeralPublicKeyJwk: pubBase64,
    qrPayloadString,
    expiresAt,
  };
}

/**
 * 既存端末側: 新端末の ECDH (P-256) 公開鍵を受け取り、ECDH 共有秘密から AES-GCM 256bit 鍵を導出して
 * スペース鍵バンドルを暗号化する。
 */
export async function wrapKeyBundleForQrPeer(
  recipientPublicKeyB64: string,
  spaceKeyFragments: Record<string, string>,
): Promise<{
  senderPublicKey: string;
  encryptedKeyBundle: string;
  iv: string;
}> {
  const recipientJwk = JSON.parse(atob(recipientPublicKeyB64)) as JsonWebKey;
  const recipientPubKey = await crypto.subtle.importKey(
    'jwk',
    recipientJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  const senderKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey'],
  );
  const senderPubJwk = await crypto.subtle.exportKey(
    'jwk',
    senderKeyPair.publicKey,
  );
  const senderPublicKey = btoa(JSON.stringify(senderPubJwk));

  const sharedAesKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: recipientPubKey },
    senderKeyPair.privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );

  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const bundleJson = JSON.stringify({
    version: 1,
    syncedAt: new Date().toISOString(),
    spaceKeyFragments,
  });
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBytes as unknown as BufferSource },
    sharedAesKey,
    new TextEncoder().encode(bundleJson),
  );

  return {
    senderPublicKey,
    encryptedKeyBundle: bytesToBase64(new Uint8Array(ciphertextBuf)),
    iv: bytesToBase64(ivBytes),
  };
}

/**
 * 新端末側: 既存端末から届いた senderPublicKey と encryptedKeyBundle を
 * IndexedDB 内の `qr_ephemeral_private_key` で ECDH 復号し、IndexedDB にスペース鍵を格納する。
 */
export async function unwrapKeyBundleFromQrPeer(params: {
  senderPublicKey: string;
  encryptedKeyBundle: string;
  iv: string;
}): Promise<{ importedSpacesCount: number }> {
  const privKey = await idbGetKey<CryptoKey>('qr_ephemeral_private_key');
  if (!privKey) {
    throw new Error('Ephemeral QR private key not found in IndexedDB');
  }

  const senderJwk = JSON.parse(atob(params.senderPublicKey)) as JsonWebKey;
  const senderPubKey = await crypto.subtle.importKey(
    'jwk',
    senderJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  const sharedAesKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: senderPubKey },
    privKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );

  const ivBytes = base64ToBytes(params.iv);
  const cipherBytes = base64ToBytes(params.encryptedKeyBundle);

  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes as unknown as BufferSource },
    sharedAesKey,
    cipherBytes as unknown as BufferSource,
  );

  const parsed = JSON.parse(new TextDecoder().decode(plainBuf)) as {
    spaceKeyFragments?: Record<string, string>;
  };
  const importedSpacesCount = await importSpaceKeyFragmentsFromSync(
    parsed.spaceKeyFragments ?? {},
  );

  return { importedSpacesCount };
}

/**
 * QRペイロード文字列から決定論的な 25x25 QR マトリックス（Finder Pattern + Timing Pattern + データビット）を生成する。
 */
export function buildQrMatrix(payload: string, size = 25): boolean[][] {
  const grid: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false),
  );
  const reserved: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false),
  );

  const placeFinder = (rowOffset: number, colOffset: number) => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const rr = rowOffset + r;
        const cc = colOffset + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        reserved[rr][cc] = true;
        if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
          const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
          const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          grid[rr][cc] = isBorder || isCenter;
        }
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  for (let i = 8; i < size - 8; i += 1) {
    reserved[6][i] = true;
    reserved[i][6] = true;
    grid[6][i] = i % 2 === 0;
    grid[i][6] = i % 2 === 0;
  }

  const bytes = new TextEncoder().encode(payload || 'irori://qr-sync');
  let bitIndex = 0;
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (reserved[r][c]) continue;
      const byteVal = bytes[bitIndex % bytes.length] ?? 0;
      const shift = (bitIndex + r * 3 + c * 5) % 8;
      const mask = (r + c) % 2 === 0 ? 1 : 0;
      grid[r][c] = (((byteVal >> shift) & 1) ^ mask) === 1;
      bitIndex += 1;
    }
  }

  return grid;
}
