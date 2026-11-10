import type {
  ChannelEntity,
  ChannelSettings,
  ClientToServerWsEvent,
  CreateSpaceDTO,
  CustomEmojiEntity,
  InsertMessageDTO,
  JoinSpaceMemberDTO,
  MessageEntity,
  ReactionSummary,
  ServerToClientWsEvent,
  SpaceMemberEntity,
  SpaceMetaEntity,
  WebhookEntity,
} from '../../app/lib/schemas/index.ts';
import {
  encodeSeedEnvelope,
  SPACE_ACTOR_DDL,
  type SqlStorageLike,
} from '../db/space.schema.ts';

interface DurableObjectStorageWithSql {
  sql: SqlStorageLike;
  setAlarm(scheduledTime: number | Date): Promise<void>;
  deleteAll(): Promise<void>;
}

interface DurableObjectStateWithWs {
  storage: DurableObjectStorageWithSql;
  acceptWebSocket(ws: WebSocket, tags?: string[]): void;
  getWebSockets(tag?: string): WebSocket[];
}

interface SpaceActorEnv {
  IRORI_BUCKET?: {
    delete(keys: string | string[]): Promise<void>;
  };
}

declare const WebSocketPair: {
  new (): { 0: WebSocket; 1: WebSocket };
};

export class SpaceActor {
  ctx: DurableObjectStateWithWs;
  env: SpaceActorEnv;
  private initialized = false;
  private typingByChannel: Map<string, Set<string>> = new Map();
  private recentActivityCount = 0;

  constructor(ctx: DurableObjectStateWithWs, env: SpaceActorEnv = {}) {
    this.ctx = ctx;
    this.env = env;
  }

  private ensureInit() {
    if (!this.initialized) {
      const sql = this.ctx.storage.sql;
      for (const stmt of SPACE_ACTOR_DDL.split(';')
        .map((s) => s.trim())
        .filter(Boolean)) {
        sql.exec(stmt);
      }
      this.initialized = true;
    }
  }

  private broadcast(event: ServerToClientWsEvent) {
    const payload = JSON.stringify(event);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {
        // 切断済みソケットは無視
      }
    }
  }

  private getReactionsForMessage(messageId: string): ReactionSummary[] {
    const rows = this.ctx.storage.sql
      .exec(
        'SELECT emoji_code, member_id FROM reactions WHERE message_id = ?',
        messageId,
      )
      .toArray();

    const map = new Map<string, string[]>();
    for (const r of rows) {
      const code = String(r.emoji_code);
      const memId = String(r.member_id);
      const list = map.get(code) ?? [];
      list.push(memId);
      map.set(code, list);
    }

    const result: ReactionSummary[] = [];
    for (const [emojiCode, memberIds] of map.entries()) {
      result.push({
        emojiCode,
        count: memberIds.length,
        memberIds,
      });
    }
    return result;
  }

  isMember(spaceId: string, memberId: string, userId?: string): boolean {
    this.ensureInit();
    const sql = this.ctx.storage.sql;
    const meta = sql
      .exec('SELECT id FROM space_meta WHERE id = ? LIMIT 1', spaceId)
      .toArray();
    if (meta.length === 0) return false;

    const row = userId
      ? sql
          .exec(
            'SELECT member_id FROM space_members WHERE member_id = ? OR user_id = ? LIMIT 1',
            memberId,
            userId,
          )
          .toArray()[0]
      : sql
          .exec(
            'SELECT member_id FROM space_members WHERE member_id = ? LIMIT 1',
            memberId,
          )
          .toArray()[0];

    return Boolean(row);
  }

  createSpace(
    spaceId: string,
    payload: CreateSpaceDTO,
  ): {
    spaceMeta: SpaceMetaEntity;
    channel: ChannelEntity;
    member: SpaceMemberEntity;
  } {
    this.ensureInit();
    const sql = this.ctx.storage.sql;

    const name = payload.name.trim() || '新しい囲炉裏';
    const badge = payload.badge || '完全招待制';
    const iconType = payload.iconType || 'flame';
    const themeColor = payload.themeColor || 'amber';
    const maxMembers = payload.maxMembers ?? 6;
    const autoCloseHours = payload.autoCloseHours ?? null;

    sql.exec(
      `INSERT INTO space_meta (
        id, name, badge, icon_type, theme_color, ambient_sound, max_members, auto_close_hours, current_key_epoch
      ) VALUES (?, ?, ?, ?, ?, 'campfire', ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        badge = excluded.badge,
        theme_color = excluded.theme_color,
        max_members = excluded.max_members`,
      spaceId,
      name,
      badge,
      iconType,
      themeColor,
      maxMembers,
      autoCloseHours,
    );

    sql.exec(
      `INSERT INTO space_members (
        member_id, user_id, role, override_name, override_avatar, override_bio,
        status_lamp, ephemeral_status_encrypted, ephemeral_status_expires_at, wrapped_space_key
      ) VALUES (?, ?, 'admin', ?, 'hima', '囲炉裏の火を灯しました🔥', 'free', NULL, NULL, ?)
      ON CONFLICT(member_id) DO UPDATE SET
        override_name = excluded.override_name,
        wrapped_space_key = excluded.wrapped_space_key`,
      payload.creatorMemberId,
      payload.creatorUserId,
      payload.creatorName,
      payload.wrappedSpaceKey,
    );

    const existingChannels = sql
      .exec(
        'SELECT id FROM channels WHERE space_id = ? ORDER BY sort_order ASC LIMIT 1',
        spaceId,
      )
      .toArray();

    let channelId = existingChannels[0]
      ? String(existingChannels[0].id)
      : 'takibi';
    if (existingChannels.length === 0) {
      channelId = 'takibi';
      const initialChannelName =
        payload.initialChannelName?.trim() || '焚き火と雑談';
      const pinnedTopic = {
        title: `${name} へようこそ 📌`,
        description:
          'ゼロ知識E2EEで守られた招待制スペースです。自分のペースで言葉を置いていってください。',
        updatedAt: 'たった今',
        commentCount: 0,
      };
      const pinnedEnc = encodeSeedEnvelope(JSON.stringify(pinnedTopic));

      sql.exec(
        `INSERT INTO channels (
          id, space_id, name, emojis, badge_text, icon_type, sort_order,
          pinned_topic_encrypted, is_read_visible, is_typing_visible,
          is_thread_enabled, is_mention_enabled, is_anonymous_mode, is_ephemeral
        ) VALUES (?, ?, ?, '🔥 👥', ?, 'green-dot', 0, ?, 1, 1, 1, 1, 0, 0)`,
        channelId,
        spaceId,
        initialChannelName,
        badge,
        pinnedEnc,
      );
    }

    const bootstrap = this.getBootstrap(
      spaceId,
      channelId,
      payload.creatorMemberId,
    );
    const channel = bootstrap.channels[0];

    const member: SpaceMemberEntity = {
      memberId: payload.creatorMemberId,
      userId: payload.creatorUserId,
      role: 'admin',
      overrideName: payload.creatorName,
      overrideAvatar: 'hima',
      overrideBio: '囲炉裏の火を灯しました🔥',
      statusLamp: 'free',
      ephemeralStatusEncrypted: null,
      ephemeralStatusExpiresAt: null,
      wrappedSpaceKey: payload.wrappedSpaceKey,
    };

    return {
      spaceMeta: bootstrap.spaceMeta,
      channel,
      member,
    };
  }

  getSpacePublicSummary(spaceId: string) {
    this.ensureInit();
    const sql = this.ctx.storage.sql;
    const metaRow = sql
      .exec('SELECT * FROM space_meta WHERE id = ? LIMIT 1', spaceId)
      .toArray()[0];

    if (!metaRow) {
      return { exists: false as const, spaceId };
    }

    const membersCountRow = sql
      .exec('SELECT COUNT(*) AS cnt FROM space_members')
      .toArray()[0];
    const firstChannelRow = sql
      .exec(
        'SELECT id, name FROM channels WHERE space_id = ? ORDER BY sort_order ASC LIMIT 1',
        spaceId,
      )
      .toArray()[0];

    return {
      exists: true as const,
      spaceId: String(metaRow.id),
      name: String(metaRow.name),
      badge: String(metaRow.badge),
      themeColor:
        (metaRow.theme_color as SpaceMetaEntity['themeColor']) ?? 'amber',
      memberCount: Number(membersCountRow?.cnt ?? 0),
      maxMembers: Number(metaRow.max_members ?? 6),
      currentKeyEpoch: Number(metaRow.current_key_epoch ?? 1),
      defaultChannelId: String(firstChannelRow?.id ?? 'takibi'),
      defaultChannelName: String(firstChannelRow?.name ?? '焚き火と雑談'),
    };
  }

  joinMember(
    spaceId: string,
    payload: JoinSpaceMemberDTO,
  ):
    | {
        ok: true;
        spaceMeta: SpaceMetaEntity;
        defaultChannelId: string;
        member: SpaceMemberEntity;
      }
    | { ok: false; error: 'SPACE_NOT_FOUND' | 'SPACE_FULL' } {
    this.ensureInit();
    const sql = this.ctx.storage.sql;
    const summary = this.getSpacePublicSummary(spaceId);
    if (!summary.exists) {
      return { ok: false, error: 'SPACE_NOT_FOUND' };
    }

    const existingMember = sql
      .exec(
        'SELECT * FROM space_members WHERE member_id = ? OR user_id = ? LIMIT 1',
        payload.memberId,
        payload.userId,
      )
      .toArray()[0];

    if (!existingMember && summary.memberCount >= summary.maxMembers) {
      return { ok: false, error: 'SPACE_FULL' };
    }

    const role = existingMember?.role === 'admin' ? 'admin' : 'member';
    const avatar = payload.overrideAvatar ?? 'hima';
    const bio = payload.overrideBio ?? '招待リンクから囲炉裏に合流しました🍵';

    sql.exec(
      `INSERT INTO space_members (
        member_id, user_id, role, override_name, override_avatar, override_bio,
        status_lamp, ephemeral_status_encrypted, ephemeral_status_expires_at, wrapped_space_key
      ) VALUES (?, ?, ?, ?, ?, ?, 'free', NULL, NULL, ?)
      ON CONFLICT(member_id) DO UPDATE SET
        override_name = excluded.override_name,
        override_bio = excluded.override_bio,
        wrapped_space_key = excluded.wrapped_space_key`,
      payload.memberId,
      payload.userId,
      role,
      payload.overrideName,
      avatar,
      bio,
      payload.wrappedSpaceKey,
    );

    const bootstrap = this.getBootstrap(
      spaceId,
      summary.defaultChannelId,
      payload.memberId,
    );

    return {
      ok: true,
      spaceMeta: bootstrap.spaceMeta,
      defaultChannelId: summary.defaultChannelId,
      member: {
        memberId: payload.memberId,
        userId: payload.userId,
        role,
        overrideName: payload.overrideName,
        overrideAvatar: avatar,
        overrideBio: bio,
        statusLamp: 'free',
        ephemeralStatusEncrypted: null,
        ephemeralStatusExpiresAt: null,
        wrappedSpaceKey: payload.wrappedSpaceKey,
      },
    };
  }

  getBootstrap(spaceId: string, channelId: string, memberId?: string) {
    this.ensureInit();
    const sql = this.ctx.storage.sql;

    const metaRow = sql
      .exec('SELECT * FROM space_meta WHERE id = ? LIMIT 1', spaceId)
      .toArray()[0];

    const exists = Boolean(metaRow);

    const spaceMeta: SpaceMetaEntity = {
      id: String(metaRow?.id ?? spaceId),
      name: String(metaRow?.name ?? '未作成のスペース'),
      badge: String(metaRow?.badge ?? '完全招待制'),
      iconType: (metaRow?.icon_type as SpaceMetaEntity['iconType']) ?? 'flame',
      themeColor:
        (metaRow?.theme_color as SpaceMetaEntity['themeColor']) ?? 'amber',
      ambientSound:
        (metaRow?.ambient_sound as SpaceMetaEntity['ambientSound']) ??
        'campfire',
      maxMembers: Number(metaRow?.max_members ?? 6),
      autoCloseHours:
        metaRow?.auto_close_hours != null
          ? Number(metaRow.auto_close_hours)
          : null,
      currentKeyEpoch: Number(metaRow?.current_key_epoch ?? 1),
    };

    const channelRows = sql
      .exec(
        'SELECT * FROM channels WHERE space_id = ? ORDER BY sort_order ASC',
        spaceId,
      )
      .toArray();

    const channels: ChannelEntity[] = channelRows.map((row) => ({
      id: String(row.id),
      spaceId: String(row.space_id),
      name: String(row.name),
      emojis: String(row.emojis),
      badgeText: String(row.badge_text),
      iconType: (row.icon_type as ChannelEntity['iconType']) ?? 'green-dot',
      sortOrder: Number(row.sort_order ?? 0),
      pinnedTopicEncrypted: String(row.pinned_topic_encrypted),
      settings: {
        isReadVisible: Number(row.is_read_visible) === 1,
        isTypingVisible: Number(row.is_typing_visible) === 1,
        isThreadEnabled: Number(row.is_thread_enabled) === 1,
        isMentionEnabled: Number(row.is_mention_enabled) === 1,
        isAnonymousMode: Number(row.is_anonymous_mode) === 1,
        isEphemeral: Number(row.is_ephemeral) === 1,
      },
    }));

    const targetChannel =
      channels.find((c) => c.id === channelId) ?? channels[0];

    const allMsgRows = targetChannel
      ? sql
          .exec(
            'SELECT * FROM messages WHERE channel_id = ? ORDER BY rowid ASC',
            targetChannel.id,
          )
          .toArray()
      : [];

    const threadCounts = new Map<string, number>();
    for (const r of allMsgRows) {
      if (r.parent_message_id != null) {
        const pid = String(r.parent_message_id);
        threadCounts.set(pid, (threadCounts.get(pid) ?? 0) + 1);
      }
    }

    const messages: MessageEntity[] = allMsgRows.map((row) => {
      const id = String(row.id);
      return {
        id,
        channelId: String(row.channel_id),
        parentMessageId:
          row.parent_message_id != null ? String(row.parent_message_id) : null,
        senderMemberId: String(row.sender_member_id),
        senderName: String(row.sender_name),
        avatarType: (row.avatar_type as MessageEntity['avatarType']) ?? 'hima',
        statusLamp: (row.status_lamp as MessageEntity['statusLamp']) ?? 'free',
        ciphertext: String(row.ciphertext),
        iv: String(row.iv),
        keyEpoch: Number(row.key_epoch ?? 1),
        workflowType:
          (row.workflow_type as MessageEntity['workflowType']) ?? null,
        workflowPayloadEncrypted:
          row.workflow_payload_encrypted != null
            ? String(row.workflow_payload_encrypted)
            : null,
        mediaPayloadEncrypted:
          row.media_payload_encrypted != null
            ? String(row.media_payload_encrypted)
            : null,
        mediaR2Key: row.media_r2_key != null ? String(row.media_r2_key) : null,
        deliveryMode:
          row.delivery_mode === 'when_free' ? 'when_free' : 'instant',
        expiresAt: row.expires_at != null ? String(row.expires_at) : null,
        isEdited: Number(row.is_edited) === 1,
        readCount: Number(row.read_count ?? 1),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
        reactions: this.getReactionsForMessage(id),
        threadCount: threadCounts.get(id) ?? 0,
      };
    });

    const emojiRows = sql
      .exec('SELECT * FROM custom_emojis ORDER BY rowid DESC')
      .toArray();
    const customEmojis: CustomEmojiEntity[] = emojiRows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      shortcode: String(r.shortcode),
      label: String(r.label),
      previewChar: String(r.preview_char ?? '🔥'),
      imageUrl: String(r.image_url),
      uploadedByMemberId: String(r.uploaded_by_member_id),
      createdAt: String(r.created_at),
    }));

    const memberRow = memberId
      ? sql
          .exec(
            'SELECT * FROM space_members WHERE member_id = ? LIMIT 1',
            memberId,
          )
          .toArray()[0]
      : sql.exec('SELECT * FROM space_members LIMIT 1').toArray()[0];

    return {
      exists,
      spaceMeta,
      channels,
      activeChannelId: targetChannel?.id ?? channelId,
      messages,
      customEmojis,
      myMemberProfile: {
        overrideName: String(memberRow?.override_name ?? 'Irori User'),
        overrideBio: String(memberRow?.override_bio ?? ''),
        wrappedSpaceKey: String(memberRow?.wrapped_space_key ?? ''),
      },
    };
  }

  async postMessage(
    _spaceId: string,
    data: InsertMessageDTO,
  ): Promise<MessageEntity> {
    this.ensureInit();
    const sql = this.ctx.storage.sql;
    const id =
      data.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nowTime = new Date().toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const channelRow = sql
      .exec(
        'SELECT is_ephemeral FROM channels WHERE id = ? LIMIT 1',
        data.channelId,
      )
      .toArray()[0];
    const isChannelEphemeral = Number(channelRow?.is_ephemeral ?? 0) === 1;

    const expiresAt =
      data.expiresAt ??
      (isChannelEphemeral
        ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        : null);

    sql.exec(
      `INSERT INTO messages (
        id, channel_id, parent_message_id, sender_member_id, sender_name,
        avatar_type, status_lamp, ciphertext, iv, key_epoch,
        workflow_type, workflow_payload_encrypted, media_payload_encrypted, media_r2_key,
        delivery_mode, expires_at, is_edited, read_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
      id,
      data.channelId,
      data.parentMessageId ?? null,
      data.senderMemberId,
      data.senderName,
      data.avatarType,
      data.statusLamp,
      data.ciphertext,
      data.iv,
      data.keyEpoch,
      data.workflowType ?? null,
      data.workflowPayloadEncrypted ?? null,
      data.mediaPayloadEncrypted ?? null,
      data.mediaR2Key ?? null,
      data.deliveryMode ?? 'instant',
      expiresAt,
      nowTime,
      nowTime,
    );

    if (expiresAt) {
      const expireTimeMs = new Date(expiresAt).getTime();
      const targetAlarmMs = Number.isNaN(expireTimeMs)
        ? Date.now() + 24 * 60 * 60 * 1000
        : expireTimeMs;
      await this.ctx.storage.setAlarm(targetAlarmMs);
    }

    this.recentActivityCount += 1;

    const entity: MessageEntity = {
      id,
      channelId: data.channelId,
      parentMessageId: data.parentMessageId ?? null,
      senderMemberId: data.senderMemberId,
      senderName: data.senderName,
      avatarType: data.avatarType,
      statusLamp: data.statusLamp,
      ciphertext: data.ciphertext,
      iv: data.iv,
      keyEpoch: data.keyEpoch,
      workflowType: data.workflowType ?? null,
      workflowPayloadEncrypted: data.workflowPayloadEncrypted ?? null,
      mediaPayloadEncrypted: data.mediaPayloadEncrypted ?? null,
      mediaR2Key: data.mediaR2Key ?? null,
      deliveryMode: data.deliveryMode ?? 'instant',
      expiresAt,
      isEdited: false,
      readCount: 1,
      createdAt: nowTime,
      updatedAt: nowTime,
      reactions: [],
      threadCount: 0,
    };

    this.broadcast({ type: 'NEW_MESSAGE', data: entity });
    return entity;
  }

  editMessage(
    _spaceId: string,
    messageId: string,
    ciphertext: string,
    iv: string,
  ): boolean {
    this.ensureInit();
    const sql = this.ctx.storage.sql;
    const nowTime = new Date().toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const row = sql
      .exec('SELECT channel_id FROM messages WHERE id = ? LIMIT 1', messageId)
      .toArray()[0];
    if (!row) return false;

    sql.exec(
      'UPDATE messages SET ciphertext = ?, iv = ?, is_edited = 1, updated_at = ? WHERE id = ?',
      ciphertext,
      iv,
      nowTime,
      messageId,
    );

    this.broadcast({
      type: 'MESSAGE_EDIT',
      data: {
        id: messageId,
        channelId: String(row.channel_id),
        ciphertext,
        iv,
        updatedAt: nowTime,
      },
    });
    return true;
  }

  async deleteMessage(_spaceId: string, messageId: string): Promise<boolean> {
    this.ensureInit();
    const sql = this.ctx.storage.sql;
    const rows = sql
      .exec(
        'SELECT id, channel_id, media_r2_key FROM messages WHERE id = ? OR parent_message_id = ?',
        messageId,
        messageId,
      )
      .toArray();
    if (rows.length === 0) return false;

    const targetRow = rows.find((r) => String(r.id) === messageId) ?? rows[0];
    const r2Keys = rows
      .map((r) => (r.media_r2_key != null ? String(r.media_r2_key) : ''))
      .filter(Boolean);

    sql.exec(
      'DELETE FROM messages WHERE id = ? OR parent_message_id = ?',
      messageId,
      messageId,
    );
    sql.exec('DELETE FROM reactions WHERE message_id = ?', messageId);

    if (r2Keys.length > 0 && this.env?.IRORI_BUCKET) {
      try {
        await this.env.IRORI_BUCKET.delete(r2Keys);
      } catch {
        // R2 削除エラー時はログを汚さず継続
      }
    }

    this.broadcast({
      type: 'MESSAGE_DELETE',
      data: { id: messageId, channelId: String(targetRow.channel_id) },
    });
    return true;
  }

  toggleReaction(
    _spaceId: string,
    channelId: string,
    messageId: string,
    memberId: string,
    emojiCode: string,
  ): ReactionSummary[] {
    this.ensureInit();
    const sql = this.ctx.storage.sql;

    const existing = sql
      .exec(
        'SELECT 1 FROM reactions WHERE message_id = ? AND member_id = ? AND emoji_code = ? LIMIT 1',
        messageId,
        memberId,
        emojiCode,
      )
      .toArray();

    if (existing.length > 0) {
      sql.exec(
        'DELETE FROM reactions WHERE message_id = ? AND member_id = ? AND emoji_code = ?',
        messageId,
        memberId,
        emojiCode,
      );
    } else {
      sql.exec(
        'INSERT INTO reactions (message_id, member_id, emoji_code) VALUES (?, ?, ?)',
        messageId,
        memberId,
        emojiCode,
      );
    }

    const reactions = this.getReactionsForMessage(messageId);
    this.broadcast({
      type: 'REACTION_UPDATE',
      data: { channelId, messageId, reactions },
    });
    return reactions;
  }

  updateChannelSettings(
    _spaceId: string,
    channelId: string,
    partial: Partial<ChannelSettings>,
  ): ChannelSettings | null {
    this.ensureInit();
    const sql = this.ctx.storage.sql;
    const row = sql
      .exec('SELECT * FROM channels WHERE id = ? LIMIT 1', channelId)
      .toArray()[0];
    if (!row) return null;

    const next: ChannelSettings = {
      isReadVisible: partial.isReadVisible ?? Number(row.is_read_visible) === 1,
      isTypingVisible:
        partial.isTypingVisible ?? Number(row.is_typing_visible) === 1,
      isThreadEnabled:
        partial.isThreadEnabled ?? Number(row.is_thread_enabled) === 1,
      isMentionEnabled:
        partial.isMentionEnabled ?? Number(row.is_mention_enabled) === 1,
      isAnonymousMode:
        partial.isAnonymousMode ?? Number(row.is_anonymous_mode) === 1,
      isEphemeral: partial.isEphemeral ?? Number(row.is_ephemeral) === 1,
    };

    sql.exec(
      `UPDATE channels SET
        is_read_visible = ?, is_typing_visible = ?, is_thread_enabled = ?,
        is_mention_enabled = ?, is_anonymous_mode = ?, is_ephemeral = ?
       WHERE id = ?`,
      next.isReadVisible ? 1 : 0,
      next.isTypingVisible ? 1 : 0,
      next.isThreadEnabled ? 1 : 0,
      next.isMentionEnabled ? 1 : 0,
      next.isAnonymousMode ? 1 : 0,
      next.isEphemeral ? 1 : 0,
      channelId,
    );

    this.broadcast({
      type: 'SETTING_TOGGLE',
      data: { channelId, settings: next },
    });
    return next;
  }

  createChannel(
    spaceId: string,
    payload: { name: string; isAnonymous: boolean; isEphemeral: boolean },
  ): ChannelEntity {
    this.ensureInit();
    const sql = this.ctx.storage.sql;
    const id = `room_${Date.now().toString(36)}`;
    const pinnedTopic = {
      title: `${payload.name} のお題カード 📌`,
      description:
        '新しく作成された小部屋です。自分のペースで言葉を置いていってください。',
      updatedAt: 'たった今',
      commentCount: 0,
    };
    const pinnedEnc = encodeSeedEnvelope(JSON.stringify(pinnedTopic));

    sql.exec(
      `INSERT INTO channels (
        id, space_id, name, emojis, badge_text, icon_type, sort_order,
        pinned_topic_encrypted, is_read_visible, is_typing_visible,
        is_thread_enabled, is_mention_enabled, is_anonymous_mode, is_ephemeral
      ) VALUES (?, ?, ?, ?, '完全招待制', ?, 99, ?, ?, ?, 1, 1, ?, ?)`,
      id,
      spaceId,
      payload.name,
      payload.isAnonymous ? '🤫 👥' : '🔥 👥',
      payload.isAnonymous ? 'anon-mask' : 'green-dot',
      pinnedEnc,
      payload.isAnonymous ? 0 : 1,
      payload.isAnonymous ? 0 : 1,
      payload.isAnonymous ? 1 : 0,
      payload.isEphemeral ? 1 : 0,
    );

    return {
      id,
      spaceId,
      name: payload.name,
      emojis: payload.isAnonymous ? '🤫 👥' : '🔥 👥',
      badgeText: '完全招待制',
      iconType: payload.isAnonymous ? 'anon-mask' : 'green-dot',
      sortOrder: 99,
      pinnedTopicEncrypted: pinnedEnc,
      settings: {
        isReadVisible: !payload.isAnonymous,
        isTypingVisible: !payload.isAnonymous,
        isThreadEnabled: true,
        isMentionEnabled: true,
        isAnonymousMode: payload.isAnonymous,
        isEphemeral: payload.isEphemeral,
      },
    };
  }

  updateMemberProfile(
    _spaceId: string,
    memberId: string,
    overrideName: string,
    overrideBio: string,
  ): boolean {
    this.ensureInit();
    this.ctx.storage.sql.exec(
      'UPDATE space_members SET override_name = ?, override_bio = ? WHERE member_id = ?',
      overrideName,
      overrideBio,
      memberId,
    );
    return true;
  }

  addCustomEmoji(
    spaceId: string,
    payload: {
      id?: string;
      shortcode: string;
      label: string;
      previewChar: string;
      imageUrl?: string;
      uploadedBy: string;
    },
  ): CustomEmojiEntity {
    this.ensureInit();
    const id = payload.id || `ce_${Date.now().toString(36)}`;
    const code = payload.shortcode.startsWith(':')
      ? payload.shortcode
      : `:${payload.shortcode}:`;
    const name = code.replace(/:/g, '');
    const nowStr = new Date().toISOString().slice(0, 10);
    const imageUrl = payload.imageUrl || `/api/media/emojis-${spaceId}-${id}`;

    this.ctx.storage.sql.exec(
      `INSERT INTO custom_emojis (id, name, shortcode, label, preview_char, image_url, uploaded_by_member_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      name,
      code,
      payload.label,
      payload.previewChar || '🔥',
      imageUrl,
      payload.uploadedBy,
      nowStr,
    );

    return {
      id,
      name,
      shortcode: code,
      label: payload.label,
      previewChar: payload.previewChar || '🔥',
      imageUrl,
      uploadedByMemberId: payload.uploadedBy,
      createdAt: nowStr,
    };
  }

  getCustomEmojis(_spaceId: string): CustomEmojiEntity[] {
    this.ensureInit();
    const rows = this.ctx.storage.sql
      .exec('SELECT * FROM custom_emojis ORDER BY rowid DESC')
      .toArray();
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      shortcode: String(r.shortcode),
      label: String(r.label),
      previewChar: String(r.preview_char ?? '🔥'),
      imageUrl: String(r.image_url),
      uploadedByMemberId: String(r.uploaded_by_member_id),
      createdAt: String(r.created_at),
    }));
  }

  createWebhook(
    spaceId: string,
    payload: {
      channelId: string;
      label: string;
      createdByMemberId: string;
    },
  ): WebhookEntity {
    this.ensureInit();
    const randomBytes = new Uint8Array(18);
    crypto.getRandomValues(randomBytes);
    const tokenHex = Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const token = `whk_${spaceId}_${tokenHex}`;
    const createdAt = new Date().toISOString();
    const label = payload.label.trim() || 'GitHub / RSS 通知';
    const channelId = payload.channelId.trim() || 'takibi';

    this.ctx.storage.sql.exec(
      `INSERT INTO webhooks (token, space_id, channel_id, label, created_by_member_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      token,
      spaceId,
      channelId,
      label,
      payload.createdByMemberId,
      createdAt,
    );

    return {
      token,
      spaceId,
      channelId,
      label,
      createdByMemberId: payload.createdByMemberId,
      createdAt,
    };
  }

  getWebhooks(spaceId: string): WebhookEntity[] {
    this.ensureInit();
    const rows = this.ctx.storage.sql
      .exec(
        'SELECT * FROM webhooks WHERE space_id = ? ORDER BY rowid DESC',
        spaceId,
      )
      .toArray();
    return rows.map((r) => ({
      token: String(r.token),
      spaceId: String(r.space_id),
      channelId: String(r.channel_id),
      label: String(r.label),
      createdByMemberId: String(r.created_by_member_id),
      createdAt: String(r.created_at),
    }));
  }

  verifyWebhookToken(
    spaceId: string,
    token: string,
  ): { valid: false } | { valid: true; webhook: WebhookEntity } {
    this.ensureInit();
    const row = this.ctx.storage.sql
      .exec(
        'SELECT * FROM webhooks WHERE space_id = ? AND token = ? LIMIT 1',
        spaceId,
        token,
      )
      .toArray()[0];
    if (!row) {
      return { valid: false };
    }
    return {
      valid: true,
      webhook: {
        token: String(row.token),
        spaceId: String(row.space_id),
        channelId: String(row.channel_id),
        label: String(row.label),
        createdByMemberId: String(row.created_by_member_id),
        createdAt: String(row.created_at),
      },
    };
  }

  deleteWebhook(spaceId: string, token: string): boolean {
    this.ensureInit();
    this.ctx.storage.sql.exec(
      'DELETE FROM webhooks WHERE space_id = ? AND token = ?',
      spaceId,
      token,
    );
    return true;
  }

  rotateSpaceKey(spaceId: string): number {
    this.ensureInit();
    const sql = this.ctx.storage.sql;
    sql.exec(
      'UPDATE space_meta SET current_key_epoch = current_key_epoch + 1 WHERE id = ?',
      spaceId,
    );
    const row = sql
      .exec(
        'SELECT current_key_epoch FROM space_meta WHERE id = ? LIMIT 1',
        spaceId,
      )
      .toArray()[0];
    return Number(row?.current_key_epoch ?? 2);
  }

  /**
   * Durable Object Alarm API
   * 1. 期限到来したエフェメラルメッセージ (expires_at <= nowIso) を SQLite から物理削除し MESSAGE_DELETE を配信
   * 2. ショート滞在ルームでアクティブ接続が 0 の場合はストレージ全体を完全破棄
   */
  async alarm(nowIso = new Date().toISOString()): Promise<{
    deletedMessageIds: string[];
    deletedR2Keys: string[];
    roomClosed: boolean;
  }> {
    this.ensureInit();
    const sql = this.ctx.storage.sql;

    const expiredRows = sql
      .exec(
        'SELECT id, channel_id, media_r2_key FROM messages WHERE expires_at IS NOT NULL AND expires_at <= ?',
        nowIso,
      )
      .toArray();

    const deletedMessageIds: string[] = [];
    const deletedR2Keys: string[] = [];

    for (const row of expiredRows) {
      const msgId = String(row.id);
      const channelId = String(row.channel_id);
      if (row.media_r2_key != null && String(row.media_r2_key)) {
        deletedR2Keys.push(String(row.media_r2_key));
      }
      sql.exec(
        'DELETE FROM messages WHERE id = ? OR parent_message_id = ?',
        msgId,
        msgId,
      );
      sql.exec('DELETE FROM reactions WHERE message_id = ?', msgId);
      deletedMessageIds.push(msgId);
      this.broadcast({
        type: 'MESSAGE_DELETE',
        data: { id: msgId, channelId },
      });
    }

    if (deletedR2Keys.length > 0 && this.env?.IRORI_BUCKET) {
      try {
        await this.env.IRORI_BUCKET.delete(deletedR2Keys);
      } catch {
        // ignore R2 deletion failure
      }
    }

    const meta = sql
      .exec('SELECT auto_close_hours FROM space_meta LIMIT 1')
      .toArray()[0];
    if (
      meta?.auto_close_hours != null &&
      this.ctx.getWebSockets().length === 0
    ) {
      const remainingMediaRows = sql
        .exec(
          'SELECT media_r2_key FROM messages WHERE media_r2_key IS NOT NULL',
        )
        .toArray();
      const remainingKeys = remainingMediaRows
        .map((r) => String(r.media_r2_key || ''))
        .filter(Boolean);
      if (remainingKeys.length > 0 && this.env?.IRORI_BUCKET) {
        try {
          await this.env.IRORI_BUCKET.delete(remainingKeys);
          deletedR2Keys.push(...remainingKeys);
        } catch {
          // ignore
        }
      }
      await this.ctx.storage.deleteAll();
      return { deletedMessageIds, deletedR2Keys, roomClosed: true };
    }

    return { deletedMessageIds, deletedR2Keys, roomClosed: false };
  }

  /**
   * Hibernatable WebSocket 受信ハンドラ
   */
  async webSocketMessage(ws: WebSocket, rawMessage: string | ArrayBuffer) {
    try {
      const text =
        typeof rawMessage === 'string'
          ? rawMessage
          : new TextDecoder().decode(rawMessage);
      const event = JSON.parse(text) as ClientToServerWsEvent;
      const attachment = (
        ws as WebSocket & {
          deserializeAttachment?: () => { spaceId?: string } | null;
        }
      ).deserializeAttachment?.();
      const metaRow = this.ctx.storage.sql
        .exec('SELECT id FROM space_meta LIMIT 1')
        .toArray()[0];
      const spaceId =
        attachment?.spaceId || (metaRow?.id ? String(metaRow.id) : '');
      if (!spaceId) return;

      if (event.type === 'TYPING_UPDATE') {
        const set = this.typingByChannel.get(event.channelId) ?? new Set();
        if (event.isTyping) {
          set.add(event.memberName);
        } else {
          set.delete(event.memberName);
        }
        this.typingByChannel.set(event.channelId, set);
        this.broadcast({
          type: 'PRESENCE_STATE',
          data: {
            channelId: event.channelId,
            onlineCount: Math.max(1, this.ctx.getWebSockets().length),
            heatLevel: Math.min(1.0, 0.35 + this.recentActivityCount * 0.08),
            typingUsers: Array.from(set),
          },
        });
      } else if (event.type === 'PRESENCE_PING') {
        ws.send(
          JSON.stringify({
            type: 'PRESENCE_STATE',
            data: {
              channelId: event.channelId,
              onlineCount: Math.max(1, this.ctx.getWebSockets().length),
              heatLevel: Math.min(1.0, 0.35 + this.recentActivityCount * 0.08),
              typingUsers: Array.from(
                this.typingByChannel.get(event.channelId) ?? [],
              ),
            },
          } satisfies ServerToClientWsEvent),
        );
      } else if (event.type === 'SEND_MESSAGE') {
        await this.postMessage(spaceId, event.payload);
      } else if (event.type === 'TOGGLE_REACTION') {
        this.toggleReaction(
          spaceId,
          event.channelId,
          event.messageId,
          event.memberId,
          event.emojiCode,
        );
      }
    } catch {
      // 不正なJSONペイロードは無視 (NFR-SEC-03)
    }
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    _wasClean: boolean,
  ) {
    try {
      ws.close(code, reason);
    } catch {
      // ignore
    }
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader && upgradeHeader.toLowerCase() === 'websocket') {
      const spaceId = request.headers.get('X-Irori-Space-Id') || '';
      const userId = request.headers.get('X-Irori-User-Id') || '';
      const memberId = request.headers.get('X-Irori-Member-Id') || '';
      const role = request.headers.get('X-Irori-Role') || 'member';

      if (!spaceId || !memberId || !this.isMember(spaceId, memberId, userId)) {
        return Response.json(
          { error: 'Forbidden: Not a member of this space' },
          { status: 403 },
        );
      }

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1] as WebSocket & {
        serializeAttachment?: (value: unknown) => void;
      };
      server.serializeAttachment?.({ spaceId, userId, memberId, role });
      this.ctx.acceptWebSocket(server);
      return new Response(null, {
        status: 101,
        webSocket: client,
      } as ResponseInit & {
        webSocket: WebSocket;
      });
    }

    if (request.method === 'POST') {
      const body = (await request.json()) as {
        rpc: string;
        spaceId: string;
        args: Record<string, unknown>;
      };
      const spaceId = body.spaceId;
      if (!spaceId) {
        return Response.json({ error: 'Missing spaceId' }, { status: 400 });
      }

      switch (body.rpc) {
        case 'createSpace':
          return Response.json(
            this.createSpace(spaceId, body.args as unknown as CreateSpaceDTO),
          );
        case 'getSpacePublicSummary':
          return Response.json(this.getSpacePublicSummary(spaceId));
        case 'joinMember':
          return Response.json(
            this.joinMember(
              spaceId,
              body.args as unknown as JoinSpaceMemberDTO,
            ),
          );
        case 'isMember':
          return Response.json({
            isMember: this.isMember(
              spaceId,
              String(body.args.memberId || ''),
              body.args.userId ? String(body.args.userId) : undefined,
            ),
          });
        case 'getBootstrap':
          return Response.json(
            this.getBootstrap(
              spaceId,
              String(body.args.channelId || 'takibi'),
              body.args.memberId ? String(body.args.memberId) : undefined,
            ),
          );
        case 'postMessage':
          return Response.json(
            await this.postMessage(
              spaceId,
              body.args.data as unknown as InsertMessageDTO,
            ),
          );
        case 'editMessage':
          return Response.json({
            ok: this.editMessage(
              spaceId,
              String(body.args.messageId),
              String(body.args.ciphertext),
              String(body.args.iv),
            ),
          });
        case 'deleteMessage':
          return Response.json({
            ok: await this.deleteMessage(spaceId, String(body.args.messageId)),
          });
        case 'toggleReaction':
          return Response.json({
            reactions: this.toggleReaction(
              spaceId,
              String(body.args.channelId),
              String(body.args.messageId),
              String(body.args.memberId),
              String(body.args.emojiCode),
            ),
          });
        case 'updateChannelSettings':
          return Response.json({
            settings: this.updateChannelSettings(
              spaceId,
              String(body.args.channelId),
              body.args.settings as Partial<ChannelSettings>,
            ),
          });
        case 'createChannel':
          return Response.json(
            this.createChannel(
              spaceId,
              body.args as {
                name: string;
                isAnonymous: boolean;
                isEphemeral: boolean;
              },
            ),
          );
        case 'updateMemberProfile':
          return Response.json({
            ok: this.updateMemberProfile(
              spaceId,
              String(body.args.memberId),
              String(body.args.overrideName),
              String(body.args.overrideBio),
            ),
          });
        case 'addCustomEmoji':
          return Response.json(
            this.addCustomEmoji(
              spaceId,
              body.args as {
                id?: string;
                shortcode: string;
                label: string;
                previewChar: string;
                imageUrl?: string;
                uploadedBy: string;
              },
            ),
          );
        case 'getCustomEmojis':
          return Response.json(this.getCustomEmojis(spaceId));
        case 'createWebhook':
          return Response.json(
            this.createWebhook(
              spaceId,
              body.args as {
                channelId: string;
                label: string;
                createdByMemberId: string;
              },
            ),
          );
        case 'getWebhooks':
          return Response.json(this.getWebhooks(spaceId));
        case 'verifyWebhookToken':
          return Response.json(
            this.verifyWebhookToken(spaceId, String(body.args.token || '')),
          );
        case 'deleteWebhook':
          return Response.json({
            ok: this.deleteWebhook(spaceId, String(body.args.token || '')),
          });
        case 'rotateSpaceKey':
          return Response.json({
            keyEpoch: this.rotateSpaceKey(spaceId),
          });
        default:
          return Response.json(
            { error: 'Unknown RPC method' },
            { status: 400 },
          );
      }
    }

    return Response.json({ status: 'SpaceActor Ready' });
  }
}
