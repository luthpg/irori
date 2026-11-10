import { idbSetKey } from './e2ee.client.ts';

const PBKDF2_ITERATIONS = 310_000;

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

/**
 * FR-KEY-02: 6桁PIN + pinSalt からサーバー検証用認証ハッシュ (pinAuthHash) を PBKDF2 (310,000回) で導出
 */
export async function derivePinAuthHash(
  pin: string,
  pinSalt: string,
): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(`irori_pin_auth:${pin}`) as unknown as BufferSource,
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(`auth_salt:${pinSalt}`) as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );

  return bytesToBase64(new Uint8Array(bits));
}

/**
 * 6桁PIN + pinSalt + サーバー環境シークレット由来の serverPepperToken を結合し、
 * AES-KW 256bit 鍵暗号化キー (KEK) を導出する（オフラインGPU総当たりを暗号学的に完全遮断）。
 */
export async function deriveBackupKek(
  pin: string,
  pinSalt: string,
  serverPepperToken: string,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(
      `irori_kek:${pin}:${serverPepperToken}`,
    ) as unknown as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(`kek_salt:${pinSalt}`) as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

/**
 * 6桁PINでユーザーマスター鍵をラップ（AES-KW）し、UserActor 保管用の暗号化ボールトを生成する。
 */
export async function createWrappedBackupVault(
  pin: string,
  pinSalt: string,
  serverPepperToken: string,
): Promise<string> {
  const kek = await deriveBackupKek(pin, pinSalt, serverPepperToken);
  const exportableMaster = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );

  const wrappedBuf = await crypto.subtle.wrapKey(
    'raw',
    exportableMaster,
    kek,
    'AES-KW',
  );
  return bytesToBase64(new Uint8Array(wrappedBuf));
}

/**
 * FR-KEY-01 & FR-KEY-02:
 * crypto.subtle.unwrapKey を直接実行し、メモリ上に平文バイト列を一切露出させずに
 * extractable: false な CryptoKey として IndexedDB へ直接復元・保存する。
 */
export async function unwrapBackupVaultToIndexedDb(
  encryptedBackupUserKey: string,
  pin: string,
  pinSalt: string,
  serverPepperToken: string,
): Promise<boolean> {
  const kek = await deriveBackupKek(pin, pinSalt, serverPepperToken);
  const wrappedBytes = base64ToBytes(encryptedBackupUserKey);

  const unwrappedKey = await crypto.subtle.unwrapKey(
    'raw',
    wrappedBytes as unknown as BufferSource,
    kek,
    'AES-KW',
    { name: 'AES-GCM', length: 256 },
    false, // extractable: false (XSS耐性)
    ['encrypt', 'decrypt'],
  );

  await idbSetKey('user_personal_master_key', unwrappedKey);
  return true;
}
