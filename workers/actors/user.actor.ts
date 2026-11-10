import type {
  BookmarkEntity,
  EnterKeyBehavior,
  InsertBookmarkDTO,
  JoinedSpaceSummary,
  NotificationLevel,
  PendingDeliveryEntity,
  QrSyncSessionEntity,
  StatusLamp,
  UserProfileEntity,
} from '../../app/lib/schemas/index.ts';
import type { SqlStorageLike } from '../db/space.schema.ts';
import { USER_ACTOR_DDL } from '../db/user.schema.ts';
import type { DurableObjectNamespaceLike } from '../rpc.server.ts';

interface UserActorState {
  storage: {
    sql: SqlStorageLike;
  };
}

interface UserActorEnv {
  IRORI_PEPPER?: string;
  SPACE_ACTOR?: DurableObjectNamespaceLike;
}

export class UserActor {
  ctx: UserActorState;
  env: UserActorEnv;
  private initialized = false;

  constructor(ctx: UserActorState, env: UserActorEnv) {
    this.ctx = ctx;
    this.env = env;
  }

  private ensureInit() {
    if (!this.initialized) {
      const sql = this.ctx.storage.sql;
      for (const stmt of USER_ACTOR_DDL.split(';')
        .map((s) => s.trim())
        .filter(Boolean)) {
        sql.exec(stmt);
      }
      this.initialized = true;
    }
  }

  private ensureProfileRow(userId: string) {
    this.ensureInit();
    const existing = this.ctx.storage.sql
      .exec('SELECT user_id FROM profile WHERE user_id = ? LIMIT 1', userId)
      .toArray();
    if (existing.length > 0) return;

    const saltBytes = new Uint8Array(16);
    crypto.getRandomValues(saltBytes);
    const randomSalt = Array.from(saltBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    this.ctx.storage.sql.exec(
      `INSERT INTO profile (
        user_id, google_sub, default_name, default_avatar, status_lamp, ephemeral_memo,
        public_key, encrypted_backup_user_key, pin_salt, pin_auth_hash,
        failed_pin_attempts, pin_locked_until
      ) VALUES (?, NULL, 'Irori User', 'hima', 'free', '', 'ecdh_p256_uninitialized', NULL, ?, NULL, 0, NULL)`,
      userId,
      `salt_${randomSalt}`,
    );
  }

  upsertOAuthUser(
    userId: string,
    payload: {
      googleSub: string;
      defaultName: string;
      defaultAvatar?: string;
      publicKey?: string;
    },
  ): UserProfileEntity {
    this.ensureInit();
    const sql = this.ctx.storage.sql;
    const existing = sql
      .exec('SELECT * FROM profile WHERE user_id = ? LIMIT 1', userId)
      .toArray()[0];

    if (!existing) {
      const saltBytes = new Uint8Array(16);
      crypto.getRandomValues(saltBytes);
      const randomSalt = Array.from(saltBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      sql.exec(
        `INSERT INTO profile (
          user_id, google_sub, default_name, default_avatar, status_lamp, ephemeral_memo,
          public_key, encrypted_backup_user_key, pin_salt, pin_auth_hash,
          failed_pin_attempts, pin_locked_until
        ) VALUES (?, ?, ?, ?, 'free', '', ?, NULL, ?, NULL, 0, NULL)`,
        userId,
        payload.googleSub,
        payload.defaultName,
        payload.defaultAvatar || 'hima',
        payload.publicKey || `ecdh_p256_${userId}`,
        `salt_${randomSalt}`,
      );
    } else {
      sql.exec(
        `UPDATE profile SET
          google_sub = ?,
          default_name = ?,
          default_avatar = COALESCE(?, default_avatar)
         WHERE user_id = ?`,
        payload.googleSub,
        payload.defaultName,
        payload.defaultAvatar ?? null,
        userId,
      );
    }

    return this.getProfile(userId);
  }

  getProfile(userId: string): UserProfileEntity {
    this.ensureProfileRow(userId);
    const row = this.ctx.storage.sql
      .exec('SELECT * FROM profile WHERE user_id = ? LIMIT 1', userId)
      .toArray()[0];

    return {
      userId: String(row?.user_id ?? userId),
      defaultName: String(row?.default_name ?? 'Irori User'),
      defaultAvatar: String(row?.default_avatar ?? 'hima'),
      statusLamp: (row?.status_lamp as StatusLamp) ?? 'free',
      ephemeralMemo: String(row?.ephemeral_memo ?? ''),
      enterKeyBehavior: row?.enter_key_behavior === 'send' ? 'send' : 'newline',
      publicKey: String(row?.public_key ?? `ecdh_p256_${userId}`),
      encryptedBackupUserKey:
        row?.encrypted_backup_user_key != null
          ? String(row.encrypted_backup_user_key)
          : null,
      pinSalt: String(row?.pin_salt ?? 'irori_user_salt'),
      failedPinAttempts: Number(row?.failed_pin_attempts ?? 0),
      pinLockedUntil:
        row?.pin_locked_until != null ? String(row.pin_locked_until) : null,
    };
  }

  updateEnterKeyBehavior(
    userId: string,
    enterKeyBehavior: EnterKeyBehavior,
  ): UserProfileEntity {
    this.ensureProfileRow(userId);
    const normalized: EnterKeyBehavior =
      enterKeyBehavior === 'send' ? 'send' : 'newline';
    this.ctx.storage.sql.exec(
      'UPDATE profile SET enter_key_behavior = ? WHERE user_id = ?',
      normalized,
      userId,
    );
    return this.getProfile(userId);
  }

  getJoinedSpaces(_userId: string): JoinedSpaceSummary[] {
    this.ensureInit();
    const rows = this.ctx.storage.sql
      .exec('SELECT * FROM joined_spaces ORDER BY rowid ASC')
      .toArray();
    return rows.map((r) => ({
      spaceId: String(r.space_id),
      spaceName: String(r.space_name),
      themeColor:
        (r.theme_color as JoinedSpaceSummary['themeColor']) ?? 'amber',
      role: r.role === 'member' ? 'member' : 'admin',
      unreadCount: Number(r.unread_count ?? 0),
      hasQuietActivity: Number(r.has_quiet_activity ?? 0) === 1,
      notificationLevel:
        (r.notification_level as NotificationLevel) ?? 'mentions',
    }));
  }

  addJoinedSpace(
    _userId: string,
    payload: {
      spaceId: string;
      spaceName: string;
      themeColor?: 'amber' | 'blue' | 'emerald';
      role?: 'admin' | 'member';
      notificationLevel?: NotificationLevel;
    },
  ): JoinedSpaceSummary {
    this.ensureInit();
    const themeColor = payload.themeColor ?? 'amber';
    const role = payload.role ?? 'admin';
    const notificationLevel = payload.notificationLevel ?? 'mentions';

    this.ctx.storage.sql.exec(
      `INSERT INTO joined_spaces (
        space_id, space_name, theme_color, role, unread_count, has_quiet_activity, notification_level
      ) VALUES (?, ?, ?, ?, 0, 1, ?)
      ON CONFLICT(space_id) DO UPDATE SET
        space_name = excluded.space_name,
        theme_color = excluded.theme_color,
        role = excluded.role`,
      payload.spaceId,
      payload.spaceName,
      themeColor,
      role,
      notificationLevel,
    );

    return {
      spaceId: payload.spaceId,
      spaceName: payload.spaceName,
      themeColor,
      role,
      unreadCount: 0,
      hasQuietActivity: true,
      notificationLevel,
    };
  }

  queuePendingDelivery(
    userId: string,
    payload: {
      spaceId: string;
      channelId: string;
      ciphertext: string;
      iv: string;
      triggerType?: 'time' | 'when_free';
      scheduledAt?: string | null;
    },
  ): PendingDeliveryEntity {
    this.ensureInit();
    const id = `pd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const triggerType = payload.triggerType ?? 'when_free';
    const scheduledAt = payload.scheduledAt ?? null;

    this.ctx.storage.sql.exec(
      `INSERT INTO pending_deliveries (
        id, target_user_id, space_id, channel_id, ciphertext, iv, trigger_type, scheduled_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      userId,
      payload.spaceId,
      payload.channelId,
      payload.ciphertext,
      payload.iv,
      triggerType,
      scheduledAt,
      nowIso,
    );

    return {
      id,
      targetUserId: userId,
      spaceId: payload.spaceId,
      channelId: payload.channelId,
      ciphertext: payload.ciphertext,
      iv: payload.iv,
      triggerType,
      scheduledAt,
      createdAt: nowIso,
    };
  }

  async flushWhenFreeDeliveries(
    userId: string,
  ): Promise<PendingDeliveryEntity[]> {
    this.ensureInit();
    const sql = this.ctx.storage.sql;
    const rows = sql
      .exec(
        "SELECT * FROM pending_deliveries WHERE target_user_id = ? AND trigger_type = 'when_free' ORDER BY rowid ASC",
        userId,
      )
      .toArray();

    if (rows.length === 0) return [];

    const profile = this.getProfile(userId);
    const flushed: PendingDeliveryEntity[] = [];

    for (const r of rows) {
      const entity: PendingDeliveryEntity = {
        id: String(r.id),
        targetUserId: String(r.target_user_id),
        spaceId: String(r.space_id),
        channelId: String(r.channel_id),
        ciphertext: String(r.ciphertext),
        iv: String(r.iv),
        triggerType: r.trigger_type === 'time' ? 'time' : 'when_free',
        scheduledAt: r.scheduled_at != null ? String(r.scheduled_at) : null,
        createdAt: String(r.created_at),
      };

      if (this.env?.SPACE_ACTOR) {
        try {
          const spaceDoId = this.env.SPACE_ACTOR.idFromName(entity.spaceId);
          const stub = this.env.SPACE_ACTOR.get(spaceDoId);
          await stub.fetch('http://space-actor/rpc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              rpc: 'postMessage',
              spaceId: entity.spaceId,
              args: {
                data: {
                  channelId: entity.channelId,
                  senderMemberId: `mem_${userId.replace(/^user_/, '')}`,
                  senderName: profile.defaultName,
                  avatarType: 'hima',
                  statusLamp: 'free',
                  ciphertext: entity.ciphertext,
                  iv: entity.iv,
                  keyEpoch: 1,
                  deliveryMode: 'when_free',
                },
              },
            }),
          });
        } catch {
          // 配信失敗時は次回フラッシュまで保持
          continue;
        }
      }

      sql.exec('DELETE FROM pending_deliveries WHERE id = ?', entity.id);
      flushed.push(entity);
    }

    return flushed;
  }

  async updateStatusLamp(
    userId: string,
    statusLamp: StatusLamp,
    ephemeralMemo?: string,
  ): Promise<UserProfileEntity> {
    this.ensureProfileRow(userId);
    if (ephemeralMemo !== undefined) {
      this.ctx.storage.sql.exec(
        'UPDATE profile SET status_lamp = ?, ephemeral_memo = ? WHERE user_id = ?',
        statusLamp,
        ephemeralMemo,
        userId,
      );
    } else {
      this.ctx.storage.sql.exec(
        'UPDATE profile SET status_lamp = ? WHERE user_id = ?',
        statusLamp,
        userId,
      );
    }

    if (statusLamp === 'free') {
      await this.flushWhenFreeDeliveries(userId);
    }

    return this.getProfile(userId);
  }

  /**
   * FR-KEY-02: 6桁PINチャレンジ情報取得 (ソルト・ロックアウト状態・残り試行回数)
   */
  getPinChallenge(userId: string) {
    const profile = this.getProfile(userId);
    const now = Date.now();
    const lockedUntilMs = profile.pinLockedUntil
      ? new Date(profile.pinLockedUntil).getTime()
      : 0;
    const isLocked = lockedUntilMs > now;
    const remainingAttempts = Math.max(0, 5 - profile.failedPinAttempts);

    return {
      pinSalt: profile.pinSalt,
      isLocked,
      remainingAttempts,
      lockedUntil: isLocked ? profile.pinLockedUntil : null,
      hasBackupVault: Boolean(profile.encryptedBackupUserKey),
    };
  }

  /**
   * FR-KEY-02: 6桁PIN暗号化ボールト登録
   */
  setBackupVault(
    userId: string,
    encryptedBackupUserKey: string,
    pinSalt: string,
    pinAuthHash: string,
  ) {
    this.ensureProfileRow(userId);
    this.ctx.storage.sql.exec(
      `UPDATE profile SET
        encrypted_backup_user_key = ?,
        pin_salt = ?,
        pin_auth_hash = ?,
        failed_pin_attempts = 0,
        pin_locked_until = NULL
       WHERE user_id = ?`,
      encryptedBackupUserKey,
      pinSalt,
      pinAuthHash,
      userId,
    );
    return {
      success: true,
      serverPepperToken: this.env?.IRORI_PEPPER || '',
    };
  }

  /**
   * FR-KEY-02: 6桁PIN検証 & ロックアウト管理 (5回連続失敗でアカウント一時凍結)
   */
  unlockBackupVault(userId: string, pinAuthHash: string) {
    this.ensureProfileRow(userId);
    const sql = this.ctx.storage.sql;
    const row = sql
      .exec('SELECT * FROM profile WHERE user_id = ? LIMIT 1', userId)
      .toArray()[0];

    const now = Date.now();
    const lockedUntilStr =
      row?.pin_locked_until != null ? String(row.pin_locked_until) : null;
    if (lockedUntilStr && new Date(lockedUntilStr).getTime() > now) {
      return {
        ok: false,
        isLocked: true,
        remainingAttempts: 0,
        lockedUntil: lockedUntilStr,
      };
    }

    const storedHash =
      row?.pin_auth_hash != null ? String(row.pin_auth_hash) : null;

    // すでにボールトが登録されている場合はハッシュ一致を厳密検証
    const isMatch = Boolean(storedHash) && storedHash === pinAuthHash;

    if (!isMatch) {
      const nextFailures = Number(row?.failed_pin_attempts ?? 0) + 1;
      const shouldLock = nextFailures >= 5;
      const lockUntilIso = shouldLock
        ? new Date(now + 15 * 60 * 1000).toISOString()
        : null;

      sql.exec(
        'UPDATE profile SET failed_pin_attempts = ?, pin_locked_until = ? WHERE user_id = ?',
        nextFailures,
        lockUntilIso,
        userId,
      );

      return {
        ok: false,
        isLocked: shouldLock,
        remainingAttempts: Math.max(0, 5 - nextFailures),
        lockedUntil: lockUntilIso,
      };
    }

    sql.exec(
      'UPDATE profile SET failed_pin_attempts = 0, pin_locked_until = NULL WHERE user_id = ?',
      userId,
    );

    return {
      ok: true,
      isLocked: false,
      remainingAttempts: 5,
      pinSalt: String(row?.pin_salt ?? ''),
      encryptedBackupUserKey:
        row?.encrypted_backup_user_key != null
          ? String(row.encrypted_backup_user_key)
          : null,
      serverPepperToken: this.env?.IRORI_PEPPER || '',
    };
  }

  /**
   * FR-PERS-01: 二重隔離された個人用ブックマーク ＆ E2EEプライベートメモ一覧取得
   */
  getBookmarks(_userId: string): BookmarkEntity[] {
    this.ensureInit();
    const rows = this.ctx.storage.sql
      .exec('SELECT * FROM bookmarks ORDER BY rowid DESC')
      .toArray();

    return rows.map((r) => {
      let tags: string[] = [];
      try {
        tags = JSON.parse(String(r.tags || '[]')) as string[];
      } catch {
        tags = [];
      }
      return {
        id: String(r.id),
        spaceId: String(r.space_id),
        channelId: String(r.channel_id),
        channelName: String(r.channel_name),
        messageId: String(r.message_id),
        senderName: String(r.sender_name),
        encryptedMessageSnapshot: String(r.encrypted_message_snapshot),
        encryptedPrivateNote: String(r.encrypted_private_note),
        iv: String(r.iv),
        tags,
        createdAt: String(r.created_at),
      };
    });
  }

  addBookmark(_userId: string, data: InsertBookmarkDTO): BookmarkEntity {
    this.ensureInit();
    const id = `bm_${Date.now().toString(36)}`;
    const nowStr = new Date().toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
    });

    this.ctx.storage.sql.exec(
      `INSERT INTO bookmarks (
        id, space_id, channel_id, channel_name, message_id, sender_name,
        encrypted_message_snapshot, encrypted_private_note, iv, tags, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      data.spaceId,
      data.channelId,
      data.channelName,
      data.messageId,
      data.senderName,
      data.encryptedMessageSnapshot,
      data.encryptedPrivateNote,
      data.iv,
      JSON.stringify(data.tags),
      `今日 ${nowStr}`,
    );

    return {
      id,
      spaceId: data.spaceId,
      channelId: data.channelId,
      channelName: data.channelName,
      messageId: data.messageId,
      senderName: data.senderName,
      encryptedMessageSnapshot: data.encryptedMessageSnapshot,
      encryptedPrivateNote: data.encryptedPrivateNote,
      iv: data.iv,
      tags: data.tags,
      createdAt: `今日 ${nowStr}`,
    };
  }

  updateBookmarkNote(
    _userId: string,
    bookmarkId: string,
    encryptedPrivateNote: string,
    iv: string,
  ): boolean {
    this.ensureInit();
    this.ctx.storage.sql.exec(
      'UPDATE bookmarks SET encrypted_private_note = ?, iv = ? WHERE id = ?',
      encryptedPrivateNote,
      iv,
      bookmarkId,
    );
    return true;
  }

  deleteBookmark(_userId: string, bookmarkId: string): boolean {
    this.ensureInit();
    this.ctx.storage.sql.exec('DELETE FROM bookmarks WHERE id = ?', bookmarkId);
    return true;
  }

  /**
   * FR-KEY-03: 端末間 QR P2P 一時鍵交換セッション作成 (新端末側)
   */
  createQrSyncSession(
    userId: string,
    payload: {
      sessionId: string;
      ephemeralPublicKey: string;
      expiresAt?: string;
    },
  ): QrSyncSessionEntity {
    this.ensureInit();
    const expiresAt =
      payload.expiresAt || new Date(Date.now() + 5 * 60 * 1000).toISOString();

    this.ctx.storage.sql.exec(
      `INSERT INTO qr_sync_sessions (
        session_id, user_id, ephemeral_public_key, sender_public_key, encrypted_key_bundle, iv, status, expires_at
      ) VALUES (?, ?, ?, NULL, NULL, NULL, 'pending', ?)
      ON CONFLICT(session_id) DO UPDATE SET
        ephemeral_public_key = excluded.ephemeral_public_key,
        sender_public_key = NULL,
        encrypted_key_bundle = NULL,
        iv = NULL,
        status = 'pending',
        expires_at = excluded.expires_at`,
      payload.sessionId,
      userId,
      payload.ephemeralPublicKey,
      expiresAt,
    );

    return {
      sessionId: payload.sessionId,
      userId,
      ephemeralPublicKey: payload.ephemeralPublicKey,
      senderPublicKey: null,
      encryptedKeyBundle: null,
      iv: null,
      status: 'pending',
      expiresAt,
    };
  }

  /**
   * FR-KEY-03: 既存端末からの暗号化鍵バンドル承認・中継保存 (ECDH P-256 + AES-GCM)
   */
  approveQrSyncSession(
    userId: string,
    payload: {
      sessionId: string;
      senderPublicKey: string;
      encryptedKeyBundle: string;
      iv: string;
    },
  ): { ok: boolean; session: QrSyncSessionEntity | null } {
    this.ensureInit();
    const current = this.getQrSyncSession(userId, payload.sessionId);
    if (!current || current.status === 'expired') {
      return { ok: false, session: current };
    }

    this.ctx.storage.sql.exec(
      `UPDATE qr_sync_sessions SET
        sender_public_key = ?,
        encrypted_key_bundle = ?,
        iv = ?,
        status = 'approved'
       WHERE session_id = ? AND user_id = ?`,
      payload.senderPublicKey,
      payload.encryptedKeyBundle,
      payload.iv,
      payload.sessionId,
      userId,
    );

    return {
      ok: true,
      session: this.getQrSyncSession(userId, payload.sessionId),
    };
  }

  /**
   * FR-KEY-03: 新端末からのポーリング確認・暗号化バンドル取得
   */
  getQrSyncSession(
    userId: string,
    sessionId: string,
  ): QrSyncSessionEntity | null {
    this.ensureInit();
    const row = this.ctx.storage.sql
      .exec(
        'SELECT * FROM qr_sync_sessions WHERE session_id = ? AND user_id = ? LIMIT 1',
        sessionId,
        userId,
      )
      .toArray()[0];

    if (!row) return null;

    const expiresAt = String(row.expires_at);
    const isExpired = new Date(expiresAt).getTime() <= Date.now();
    const status: QrSyncSessionEntity['status'] = isExpired
      ? 'expired'
      : row.status === 'approved'
        ? 'approved'
        : 'pending';

    if (isExpired && row.status !== 'expired') {
      this.ctx.storage.sql.exec(
        "UPDATE qr_sync_sessions SET status = 'expired' WHERE session_id = ?",
        sessionId,
      );
    }

    return {
      sessionId: String(row.session_id),
      userId: String(row.user_id),
      ephemeralPublicKey: String(row.ephemeral_public_key),
      senderPublicKey:
        row.sender_public_key != null ? String(row.sender_public_key) : null,
      encryptedKeyBundle:
        row.encrypted_key_bundle != null
          ? String(row.encrypted_key_bundle)
          : null,
      iv: row.iv != null ? String(row.iv) : null,
      status,
      expiresAt,
    };
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === 'POST') {
      const body = (await request.json()) as {
        rpc: string;
        userId: string;
        args: Record<string, unknown>;
      };
      const userId = body.userId;
      if (!userId) {
        return Response.json({ error: 'Missing userId' }, { status: 400 });
      }

      switch (body.rpc) {
        case 'upsertOAuthUser':
          return Response.json(
            this.upsertOAuthUser(
              userId,
              body.args as {
                googleSub: string;
                defaultName: string;
                defaultAvatar?: string;
                publicKey?: string;
              },
            ),
          );
        case 'getProfile':
          return Response.json(this.getProfile(userId));
        case 'getJoinedSpaces':
          return Response.json(this.getJoinedSpaces(userId));
        case 'addJoinedSpace':
          return Response.json(
            this.addJoinedSpace(
              userId,
              body.args as {
                spaceId: string;
                spaceName: string;
                themeColor?: 'amber' | 'blue' | 'emerald';
                role?: 'admin' | 'member';
                notificationLevel?: NotificationLevel;
              },
            ),
          );
        case 'queuePendingDelivery':
          return Response.json(
            this.queuePendingDelivery(
              userId,
              body.args as {
                spaceId: string;
                channelId: string;
                ciphertext: string;
                iv: string;
                triggerType?: 'time' | 'when_free';
                scheduledAt?: string | null;
              },
            ),
          );
        case 'flushWhenFreeDeliveries':
          return Response.json(await this.flushWhenFreeDeliveries(userId));
        case 'updateStatusLamp':
          return Response.json(
            await this.updateStatusLamp(
              userId,
              body.args.statusLamp as StatusLamp,
              body.args.ephemeralMemo as string | undefined,
            ),
          );
        case 'updateEnterKeyBehavior':
          return Response.json(
            this.updateEnterKeyBehavior(
              userId,
              body.args.enterKeyBehavior as EnterKeyBehavior,
            ),
          );
        case 'getPinChallenge':
          return Response.json(this.getPinChallenge(userId));
        case 'setBackupVault':
          return Response.json(
            this.setBackupVault(
              userId,
              String(body.args.encryptedBackupUserKey),
              String(body.args.pinSalt),
              String(body.args.pinAuthHash),
            ),
          );
        case 'unlockBackupVault':
          return Response.json(
            this.unlockBackupVault(userId, String(body.args.pinAuthHash)),
          );
        case 'getBookmarks':
          return Response.json(this.getBookmarks(userId));
        case 'addBookmark':
          return Response.json(
            this.addBookmark(
              userId,
              body.args.data as unknown as InsertBookmarkDTO,
            ),
          );
        case 'updateBookmarkNote':
          return Response.json({
            ok: this.updateBookmarkNote(
              userId,
              String(body.args.bookmarkId),
              String(body.args.encryptedPrivateNote),
              String(body.args.iv),
            ),
          });
        case 'deleteBookmark':
          return Response.json({
            ok: this.deleteBookmark(userId, String(body.args.bookmarkId)),
          });
        case 'createQrSyncSession':
          return Response.json(
            this.createQrSyncSession(
              userId,
              body.args as {
                sessionId: string;
                ephemeralPublicKey: string;
                expiresAt?: string;
              },
            ),
          );
        case 'approveQrSyncSession':
          return Response.json(
            this.approveQrSyncSession(
              userId,
              body.args as {
                sessionId: string;
                senderPublicKey: string;
                encryptedKeyBundle: string;
                iv: string;
              },
            ),
          );
        case 'getQrSyncSession':
          return Response.json({
            session: this.getQrSyncSession(
              userId,
              String(body.args.sessionId || ''),
            ),
          });
        default:
          return Response.json({ error: 'Unknown RPC' }, { status: 400 });
      }
    }

    return Response.json({ status: 'UserActor Ready' });
  }
}
