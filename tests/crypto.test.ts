import { describe, expect, it } from 'vitest';
import { buildGoogleCallbackUri } from '../app/lib/auth/oauth.server.ts';
import {
  getExternalOrigin,
  isSecureRequest,
  signSessionToken,
  verifySessionFromRequest,
  verifySessionToken,
} from '../app/lib/auth/session.server.ts';
import {
  createWrappedBackupVault,
  derivePinAuthHash,
  unwrapBackupVaultToIndexedDb,
} from '../app/lib/crypto/backup-pin.client.ts';
import {
  generateNewSpaceMasterKey,
  getStoredInviteKeyFragment,
  importSpaceMasterKeyFromFragment,
} from '../app/lib/crypto/e2ee.client.ts';
import {
  decryptBinaryFromSpace,
  decryptFromSpace,
  decryptPersonalNote,
  encryptBinaryForSpace,
  encryptForSpace,
  encryptPersonalNote,
} from '../app/lib/crypto/envelope.client.ts';
import {
  buildQrMatrix,
  createQrSyncSession,
  unwrapKeyBundleFromQrPeer,
  wrapKeyBundleForQrPeer,
} from '../app/lib/crypto/qr-sync.client.ts';

const TEST_SECRET = 'test-session-secret-32-bytes-minimum-key-2026';

describe('HMAC-SHA256 Session Signing & Strict Verification (No Fallback)', () => {
  it('signs and verifies a valid session token', async () => {
    const now = Date.now();
    const session = {
      userId: 'user_google_123',
      memberId: 'mem_google_123',
      defaultName: 'ケンタ',
      role: 'admin' as const,
      issuedAt: now,
      expiresAt: now + 60_000,
    };

    const token = await signSessionToken(session, TEST_SECRET);
    const verified = await verifySessionToken(token, TEST_SECRET, now + 1000);
    expect(verified).toEqual(session);
  });

  it('rejects tampered tokens, wrong secrets, and expired tokens', async () => {
    const now = Date.now();
    const token = await signSessionToken(
      {
        userId: 'user_google_123',
        memberId: 'mem_google_123',
        defaultName: 'ケンタ',
        role: 'admin',
        issuedAt: now,
        expiresAt: now + 60_000,
      },
      TEST_SECRET,
    );

    const tampered = `${token.slice(0, -2)}ab`;
    expect(await verifySessionToken(tampered, TEST_SECRET, now)).toBeNull();
    expect(
      await verifySessionToken(
        token,
        'different-secret-that-is-at-least-16-chars',
        now,
      ),
    ).toBeNull();
    expect(
      await verifySessionToken(token, TEST_SECRET, now + 120_000),
    ).toBeNull();
  });

  it('returns null on unauthenticated requests without any demo fallback', async () => {
    const reqWithoutCookie = new Request('https://irori.example/api/users/me');
    const result = await verifySessionFromRequest(
      reqWithoutCookie,
      TEST_SECRET,
    );
    expect(result).toBeNull();
  });
});

describe('Zero-Knowledge E2EE Space Master Key (SMK) & Invite Fragment', () => {
  it('generates non-extractable 256-bit SMK and shares via URL fragment (#key=...)', async () => {
    const { smk, inviteKeyFragment, wrappedSpaceKey } =
      await generateNewSpaceMasterKey('space-alpha-01', 1);

    expect(smk.extractable).toBe(false);
    expect(inviteKeyFragment.length).toBeGreaterThanOrEqual(40);
    expect(wrappedSpaceKey.startsWith('umk_wrap_v1:')).toBe(true);

    const messageText = 'パチパチと爆ぜる炭火の音とほうじ茶🍵🔥';
    const encrypted = await encryptForSpace(messageText, 'space-alpha-01', 1);
    expect(encrypted.ciphertext.startsWith('aes256gcm:')).toBe(true);

    // 別クライアントが URL フラグメント #key=... から SMK をインポートして復号
    const imported = await importSpaceMasterKeyFromFragment(
      'space-alpha-01-peer',
      inviteKeyFragment,
      1,
    );
    expect(imported.smk.extractable).toBe(false);

    const decrypted = await decryptFromSpace(
      encrypted.ciphertext,
      encrypted.iv,
      'space-alpha-01-peer',
      1,
    );
    expect(decrypted).toBe(messageText);
  });

  it('encrypts and decrypts binary media buffers (Cloudflare R2 E2EE)', async () => {
    await generateNewSpaceMasterKey('space-r2-test', 1);
    const sampleBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]);
    const { encryptedBuffer, iv } = await encryptBinaryForSpace(
      sampleBytes.buffer,
      'space-r2-test',
      1,
    );

    expect(encryptedBuffer.byteLength).not.toBe(sampleBytes.byteLength);
    const decryptedBuffer = await decryptBinaryFromSpace(
      encryptedBuffer,
      iv,
      'space-r2-test',
      1,
    );
    expect(new Uint8Array(decryptedBuffer)).toEqual(sampleBytes);
  });
});

describe('Personal Master Key (UMK) & 6-Digit Backup PIN Vault (AES-KW)', () => {
  it('encrypts and decrypts double-isolated personal bookmark notes', async () => {
    const secretMemo = '共有チャット欄には出ない自分専用の非公開メモ🔖';
    const { ciphertext, iv } = await encryptPersonalNote(secretMemo);
    expect(ciphertext.startsWith('umk256gcm:')).toBe(true);

    const decrypted = await decryptPersonalNote(ciphertext, iv);
    expect(decrypted).toBe(secretMemo);
  });

  it('wraps and unwraps backup vault with 6-digit PIN + Server Pepper', async () => {
    const pin = '482910';
    const salt = 'salt_test_2026';
    const pepper = 'pepper_edge_secret_2026';

    const hash1 = await derivePinAuthHash(pin, salt);
    const hash2 = await derivePinAuthHash(pin, salt);
    const wrongHash = await derivePinAuthHash('999999', salt);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(wrongHash);

    const vault = await createWrappedBackupVault(pin, salt, pepper);
    const ok = await unwrapBackupVaultToIndexedDb(vault, pin, salt, pepper);
    expect(ok).toBe(true);

    await expect(
      unwrapBackupVaultToIndexedDb(vault, '000000', salt, pepper),
    ).rejects.toThrow();
  });

  it('performs P2P ECDH (P-256) key bundle wrapping/unwrapping for QR sync and respects X-Forwarded-Proto', async () => {
    const { inviteKeyFragment } = await generateNewSpaceMasterKey(
      'space-qr-target',
      1,
    );

    const qrSession = await createQrSyncSession();
    const matrix = buildQrMatrix(qrSession.qrPayloadString, 25);
    expect(matrix.length).toBe(25);
    expect(matrix[0][0]).toBe(true); // Top-left finder corner

    const wrapped = await wrapKeyBundleForQrPeer(
      qrSession.ephemeralPublicKeyJwk,
      {
        'space-qr-restored:ep1': inviteKeyFragment,
      },
    );

    const unwrapped = await unwrapKeyBundleFromQrPeer(wrapped);
    expect(unwrapped.importedSpacesCount).toBe(1);
    const restoredFrag = await getStoredInviteKeyFragment(
      'space-qr-restored',
      1,
    );
    expect(restoredFrag).toBe(inviteKeyFragment);

    // X-Forwarded-Proto / X-Forwarded-Host 対応検証
    const proxiedReq = new Request('http://127.0.0.1:8787/auth/google', {
      headers: {
        'X-Forwarded-Proto': 'https',
        'X-Forwarded-Host': 'irori.example.com',
      },
    });
    expect(isSecureRequest(proxiedReq)).toBe(true);
    expect(getExternalOrigin(proxiedReq)).toBe('https://irori.example.com');
    expect(buildGoogleCallbackUri(proxiedReq)).toBe(
      'https://irori.example.com/auth/google/callback',
    );
  });
});
