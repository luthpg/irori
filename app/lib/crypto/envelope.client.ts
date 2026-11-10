import {
  getOrInitPersonalMasterKey,
  getOrInitSpaceMasterKey,
} from './e2ee.client.ts';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeUtf8Base64(b64: string): string {
  try {
    const bytes = base64ToBytes(b64);
    return new TextDecoder().decode(bytes);
  } catch {
    return b64;
  }
}

/**
 * メッセージ本文やワークフロー入力を SpaceMasterKey (AES-GCM 256bit) で暗号化する。
 */
export async function encryptForSpace(
  plaintext: string,
  spaceId: string,
  keyEpoch = 1,
): Promise<{ ciphertext: string; iv: string }> {
  const smk = await getOrInitSpaceMasterKey(spaceId, keyEpoch);
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const encryptedBuf = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: ivBytes as unknown as BufferSource,
    },
    smk,
    encoded as unknown as BufferSource,
  );

  return {
    ciphertext: `aes256gcm:${bytesToBase64(new Uint8Array(encryptedBuf))}`,
    iv: bytesToBase64(ivBytes),
  };
}

/**
 * SpaceActor から取得した暗号文を SpaceMasterKey で復号する。
 * - `aes256gcm:` プレフィックス: Web Crypto API AES-GCM 256bit で実際に復号
 * - `e2ee_v1:` プレフィックス: 初期シード暗号化エンベロープを展開
 */
export async function decryptFromSpace(
  ciphertext: string,
  iv: string,
  spaceId: string,
  keyEpoch = 1,
): Promise<string> {
  if (!ciphertext) return '';

  if (ciphertext.startsWith('e2ee_v1:')) {
    return decodeUtf8Base64(ciphertext.slice('e2ee_v1:'.length));
  }

  if (ciphertext.startsWith('aes256gcm:')) {
    try {
      const smk = await getOrInitSpaceMasterKey(spaceId, keyEpoch);
      const rawCipher = base64ToBytes(ciphertext.slice('aes256gcm:'.length));
      const ivBytes = base64ToBytes(iv);
      const decryptedBuf = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: ivBytes as unknown as BufferSource,
        },
        smk,
        rawCipher as unknown as BufferSource,
      );
      return new TextDecoder().decode(decryptedBuf);
    } catch {
      return '[🔒 鍵世代または復号キーが異なるため復号できません]';
    }
  }

  return ciphertext;
}

/**
 * Cloudflare R2 (IRORI_BUCKET) へアップロードする画像・バイナリファイルを
 * クライアント側で SpaceMasterKey (AES-GCM 256bit) により暗号化する。
 */
export async function encryptBinaryForSpace(
  plainBuffer: ArrayBuffer,
  spaceId: string,
  keyEpoch = 1,
): Promise<{ encryptedBuffer: ArrayBuffer; iv: string }> {
  const smk = await getOrInitSpaceMasterKey(spaceId, keyEpoch);
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: ivBytes as unknown as BufferSource,
    },
    smk,
    plainBuffer,
  );

  return {
    encryptedBuffer,
    iv: bytesToBase64(ivBytes),
  };
}

export async function decryptBinaryFromSpace(
  encryptedBuffer: ArrayBuffer,
  iv: string,
  spaceId: string,
  keyEpoch = 1,
): Promise<ArrayBuffer> {
  const smk = await getOrInitSpaceMasterKey(spaceId, keyEpoch);
  const ivBytes = base64ToBytes(iv);
  return crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBytes as unknown as BufferSource,
    },
    smk,
    encryptedBuffer,
  );
}

/**
 * 自分専用ブックマーク＆プライベートメモを個人の UserMasterKey で二重隔離暗号化する。
 */
export async function encryptPersonalNote(
  plaintext: string,
): Promise<{ ciphertext: string; iv: string }> {
  const umk = await getOrInitPersonalMasterKey();
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const encryptedBuf = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: ivBytes as unknown as BufferSource,
    },
    umk,
    encoded as unknown as BufferSource,
  );

  return {
    ciphertext: `umk256gcm:${bytesToBase64(new Uint8Array(encryptedBuf))}`,
    iv: bytesToBase64(ivBytes),
  };
}

export async function decryptPersonalNote(
  ciphertext: string,
  iv: string,
): Promise<string> {
  if (!ciphertext) return '';
  if (ciphertext.startsWith('e2ee_v1:')) {
    return decodeUtf8Base64(ciphertext.slice('e2ee_v1:'.length));
  }
  if (ciphertext.startsWith('umk256gcm:')) {
    try {
      const umk = await getOrInitPersonalMasterKey();
      const rawCipher = base64ToBytes(ciphertext.slice('umk256gcm:'.length));
      const ivBytes = base64ToBytes(iv);
      const decryptedBuf = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: ivBytes as unknown as BufferSource,
        },
        umk,
        rawCipher as unknown as BufferSource,
      );
      return new TextDecoder().decode(decryptedBuf);
    } catch {
      return '[🔒 個人専用鍵で保護されたメモ]';
    }
  }
  return ciphertext;
}
