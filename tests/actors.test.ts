import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { SpaceActor } from '../workers/actors/space.actor.ts';
import { UserActor } from '../workers/actors/user.actor.ts';
import type { SqlStorageLike } from '../workers/db/space.schema.ts';
import {
  checkRateLimit,
  resetRateLimitsForTest,
} from '../workers/rate-limit.server.ts';

function createMemorySqlStorage(): SqlStorageLike {
  const db = new DatabaseSync(':memory:');
  return {
    exec(query: string, ...bindings: unknown[]) {
      const trimmed = query.trim();
      const stmt = db.prepare(trimmed);
      const isSelectOrReturning =
        /^(SELECT|PRAGMA)/i.test(trimmed) || /\bRETURNING\b/i.test(trimmed);
      if (isSelectOrReturning) {
        const rows = stmt.all(...(bindings as never[])) as Record<
          string,
          unknown
        >[];
        return {
          toArray: () => rows,
        };
      }
      stmt.run(...(bindings as never[]));
      return {
        toArray: () => [],
      };
    },
  };
}

describe('SpaceActor SQLite Operations, Alarm Physical Deletion & Settings', () => {
  it('starts in a clean empty state and creates a space, posts/edits/deletes messages, and runs alarm physical purge', async () => {
    const sql = createMemorySqlStorage();
    let scheduledAlarmMs: number | null = null;
    const broadcastedEvents: unknown[] = [];

    const mockWs = {
      send(payload: string) {
        broadcastedEvents.push(JSON.parse(payload));
      },
    } as unknown as WebSocket;

    const actor = new SpaceActor(
      {
        storage: {
          sql,
          async setAlarm(time: number | Date) {
            scheduledAlarmMs = typeof time === 'number' ? time : time.getTime();
          },
          async deleteAll() {},
        },
        acceptWebSocket() {},
        getWebSockets() {
          return [mockWs];
        },
      },
      {},
    );

    // 1. クリーンな初期状態ではスペースが存在しないことを確認
    const initialSummary = actor.getSpacePublicSummary('irori-test');
    expect(initialSummary.exists).toBe(false);

    // 2. スペース新規作成
    const created = actor.createSpace('irori-test', {
      spaceId: 'irori-test',
      name: 'テスト囲炉裏',
      creatorUserId: 'user_01',
      creatorMemberId: 'mem_01',
      creatorName: 'Hima',
      wrappedSpaceKey: 'umk_wrap_v1:test_smk',
      initialChannelName: '焚き火と雑談',
    });
    expect(created.spaceMeta.name).toBe('テスト囲炉裏');
    expect(created.channel.name).toBe('焚き火と雑談');
    expect(actor.isMember('irori-test', 'mem_01', 'user_01')).toBe(true);
    expect(actor.isMember('irori-test', 'mem_stranger')).toBe(false);

    // 3. エフェメラル期限付きメッセージの投稿と Alarm 予約の確認
    const pastIso = new Date(Date.now() - 60_000).toISOString();
    const msg = await actor.postMessage('irori-test', {
      id: 'msg_ephemeral_1',
      channelId: created.channel.id,
      senderMemberId: 'mem_01',
      senderName: 'Hima',
      avatarType: 'hima',
      statusLamp: 'free',
      ciphertext: 'aes256gcm:encrypted_hello',
      iv: 'iv_12bytes',
      keyEpoch: 1,
      expiresAt: pastIso,
    });
    expect(msg.id).toBe('msg_ephemeral_1');
    expect(scheduledAlarmMs).not.toBeNull();

    // 4. リアクションのトグル (追加 → 削除)
    const r1 = actor.toggleReaction(
      'irori-test',
      created.channel.id,
      msg.id,
      'mem_01',
      '🔥',
    );
    expect(r1.length).toBe(1);
    expect(r1[0].count).toBe(1);

    const r2 = actor.toggleReaction(
      'irori-test',
      created.channel.id,
      msg.id,
      'mem_01',
      '🔥',
    );
    expect(r2.length).toBe(0);

    // 5. Alarm 実行による期限切れメッセージの SQLite 物理削除と MESSAGE_DELETE 配信
    const alarmResult = await actor.alarm(new Date().toISOString());
    expect(alarmResult.deletedMessageIds).toEqual(['msg_ephemeral_1']);

    const afterAlarm = actor.getBootstrap(
      'irori-test',
      created.channel.id,
      'mem_01',
    );
    expect(afterAlarm.messages.length).toBe(0);
  });

  it('physically deletes attached R2 objects on deleteMessage and alarm(), and verifies webhook tokens', async () => {
    const sql = createMemorySqlStorage();
    const deletedR2Keys: string[] = [];

    const actor = new SpaceActor(
      {
        storage: {
          sql,
          async setAlarm() {},
          async deleteAll() {},
        },
        acceptWebSocket() {},
        getWebSockets() {
          return [];
        },
      },
      {
        IRORI_BUCKET: {
          async delete(keys: string | string[]) {
            if (Array.isArray(keys)) {
              deletedR2Keys.push(...keys);
            } else {
              deletedR2Keys.push(keys);
            }
          },
        },
      },
    );

    actor.createSpace('irori-r2-wh', {
      spaceId: 'irori-r2-wh',
      name: 'R2 & Webhook テスト囲炉裏',
      creatorUserId: 'user_01',
      creatorMemberId: 'mem_01',
      creatorName: 'Hima',
      wrappedSpaceKey: 'umk_wrap_v1:test',
    });

    // 1. メディア付きメッセージを手動物理削除 → R2 バケットからも削除される
    const mediaMsg = await actor.postMessage('irori-r2-wh', {
      id: 'msg_with_r2_1',
      channelId: 'takibi',
      senderMemberId: 'mem_01',
      senderName: 'Hima',
      avatarType: 'hima',
      statusLamp: 'free',
      ciphertext: 'aes256gcm:photo',
      iv: 'iv_photo',
      keyEpoch: 1,
      mediaR2Key: 'media-irori-r2-wh-photo1',
    });
    expect(mediaMsg.mediaR2Key).toBe('media-irori-r2-wh-photo1');

    const deleted = await actor.deleteMessage('irori-r2-wh', 'msg_with_r2_1');
    expect(deleted).toBe(true);
    expect(deletedR2Keys).toContain('media-irori-r2-wh-photo1');

    // 2. 期限切れメディア付きメッセージを Alarm で自動パージ → R2 バケットからも削除される
    const pastIso = new Date(Date.now() - 10_000).toISOString();
    await actor.postMessage('irori-r2-wh', {
      id: 'msg_with_r2_expired',
      channelId: 'takibi',
      senderMemberId: 'mem_01',
      senderName: 'Hima',
      avatarType: 'hima',
      statusLamp: 'free',
      ciphertext: 'aes256gcm:expired_photo',
      iv: 'iv_photo2',
      keyEpoch: 1,
      mediaR2Key: 'media-irori-r2-wh-photo2',
      expiresAt: pastIso,
    });

    const alarmRes = await actor.alarm(new Date().toISOString());
    expect(alarmRes.deletedR2Keys).toContain('media-irori-r2-wh-photo2');
    expect(deletedR2Keys).toContain('media-irori-r2-wh-photo2');

    // 3. Inbound Webhook トークンの登録と厳密検証
    const wh = actor.createWebhook('irori-r2-wh', {
      channelId: 'takibi',
      label: 'GitHub Actions',
      createdByMemberId: 'mem_01',
    });
    expect(wh.token.startsWith('whk_irori-r2-wh_')).toBe(true);

    const validCheck = actor.verifyWebhookToken('irori-r2-wh', wh.token);
    expect(validCheck.valid).toBe(true);

    const invalidCheck = actor.verifyWebhookToken(
      'irori-r2-wh',
      'whk_irori-r2-wh_forged_token',
    );
    expect(invalidCheck.valid).toBe(false);
  });
});

describe('UserActor PIN 5-Attempt Lockout & When-Free Delivery Flush', () => {
  it('locks out PIN verification after 5 consecutive failures', () => {
    const sql = createMemorySqlStorage();
    const userActor = new UserActor(
      { storage: { sql } },
      { IRORI_PEPPER: 'test-pepper-secret' },
    );

    userActor.upsertOAuthUser('user_01', {
      googleSub: 'sub_12345',
      defaultName: 'Hima',
    });

    userActor.setBackupVault(
      'user_01',
      'wrapped_vault_blob',
      'salt_01',
      'correct_pin_hash',
    );

    // 4回連続失敗 → まだロックされない (remainingAttempts = 1)
    for (let i = 1; i <= 4; i += 1) {
      const attempt = userActor.unlockBackupVault('user_01', 'wrong_hash');
      expect(attempt.ok).toBe(false);
      expect(attempt.isLocked).toBe(false);
      expect(attempt.remainingAttempts).toBe(5 - i);
    }

    // 5回目の失敗 → 15分間ロックアウト発動
    const fifthAttempt = userActor.unlockBackupVault('user_01', 'wrong_hash');
    expect(fifthAttempt.ok).toBe(false);
    expect(fifthAttempt.isLocked).toBe(true);
    expect(fifthAttempt.remainingAttempts).toBe(0);
    expect(fifthAttempt.lockedUntil).toBeTruthy();

    // ロックアウト中は正しいハッシュを送っても拒否される
    const whileLocked = userActor.unlockBackupVault(
      'user_01',
      'correct_pin_hash',
    );
    expect(whileLocked.ok).toBe(false);
    expect(whileLocked.isLocked).toBe(true);
  });

  it('flushes pending when_free deliveries when statusLamp transitions to free', async () => {
    const userSql = createMemorySqlStorage();
    const spaceSql = createMemorySqlStorage();

    const spaceActor = new SpaceActor(
      {
        storage: {
          sql: spaceSql,
          async setAlarm() {},
          async deleteAll() {},
        },
        acceptWebSocket() {},
        getWebSockets() {
          return [];
        },
      },
      {},
    );

    spaceActor.createSpace('irori-free-test', {
      spaceId: 'irori-free-test',
      name: '気配連動テスト囲炉裏',
      creatorUserId: 'user_01',
      creatorMemberId: 'mem_01',
      creatorName: 'Hima',
      wrappedSpaceKey: 'umk_wrap_v1:key',
    });

    const userActor = new UserActor(
      { storage: { sql: userSql } },
      {
        IRORI_PEPPER: 'test-pepper',
        SPACE_ACTOR: {
          idFromName: (name: string) => ({ toString: () => name }),
          get: () => ({
            fetch: (input: RequestInfo | URL, init?: RequestInit) =>
              spaceActor.fetch(new Request(input, init)),
          }),
        },
      },
    );

    userActor.upsertOAuthUser('user_01', {
      googleSub: 'sub_01',
      defaultName: 'Hima',
    });

    // ステータスを busy にしてから when_free メッセージをキューに追加
    await userActor.updateStatusLamp('user_01', 'busy');
    userActor.queuePendingDelivery('user_01', {
      spaceId: 'irori-free-test',
      channelId: 'takibi',
      ciphertext: 'aes256gcm:when_free_msg',
      iv: 'iv_free_12b',
      triggerType: 'when_free',
    });

    // ステータスを free (🟢 ひま) に変更 → SpaceActor へ自動配信される
    await userActor.updateStatusLamp('user_01', 'free');

    const bootstrap = spaceActor.getBootstrap(
      'irori-free-test',
      'takibi',
      'mem_01',
    );
    expect(bootstrap.messages.length).toBe(1);
    expect(bootstrap.messages[0].ciphertext).toBe('aes256gcm:when_free_msg');
    expect(bootstrap.messages[0].deliveryMode).toBe('when_free');
  });

  it('relays QR P2P sync session through UserActor and enforces sliding-window rate limits', () => {
    const sql = createMemorySqlStorage();
    const userActor = new UserActor({ storage: { sql } }, {});

    const created = userActor.createQrSyncSession('user_qr_01', {
      sessionId: 'qrs_test_1',
      ephemeralPublicKey: 'pub_key_new_device',
    });
    expect(created.status).toBe('pending');

    const approved = userActor.approveQrSyncSession('user_qr_01', {
      sessionId: 'qrs_test_1',
      senderPublicKey: 'pub_key_existing_device',
      encryptedKeyBundle: 'aes_gcm_wrapped_bundle',
      iv: 'iv_12b',
    });
    expect(approved.ok).toBe(true);
    expect(approved.session?.status).toBe('approved');
    expect(approved.session?.encryptedKeyBundle).toBe('aes_gcm_wrapped_bundle');

    resetRateLimitsForTest();
    const now = 1_700_000_000_000;
    expect(
      checkRateLimit('test:user_1', { limit: 2, windowMs: 60_000, nowMs: now })
        .allowed,
    ).toBe(true);
    expect(
      checkRateLimit('test:user_1', {
        limit: 2,
        windowMs: 60_000,
        nowMs: now + 100,
      }).allowed,
    ).toBe(true);
    const blocked = checkRateLimit('test:user_1', {
      limit: 2,
      windowMs: 60_000,
      nowMs: now + 200,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });
});
