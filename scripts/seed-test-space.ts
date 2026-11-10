import {
  INITIAL_BOOKMARKS,
  INITIAL_CUSTOM_EMOJIS,
  INITIAL_MESSAGES,
  INITIAL_SPACES,
  INITIAL_THREAD_REPLIES,
} from '../app/lib/mock-data.ts';
import {
  encodeSeedEnvelope,
  SPACE_ACTOR_DDL,
  type SqlStorageLike,
} from '../workers/db/space.schema.ts';
import { USER_ACTOR_DDL } from '../workers/db/user.schema.ts';

/**
 * アプリ本体の実行コードから完全に切り離されたテストデータ投入ユーティリティ。
 * SpaceActor 内蔵 SQLite に対してテスト用スペース (囲炉裏 / 焚き火と雑談 等) を投入する。
 */
export function seedTestSpaceSql(
  sql: SqlStorageLike,
  spaceId = 'irori-main',
): void {
  for (const stmt of SPACE_ACTOR_DDL.split(';')
    .map((s) => s.trim())
    .filter(Boolean)) {
    sql.exec(stmt);
  }

  const seedSpace =
    INITIAL_SPACES.find((s) => s.id === spaceId) ?? INITIAL_SPACES[0];

  sql.exec(
    `INSERT OR REPLACE INTO space_meta (id, name, badge, icon_type, theme_color, ambient_sound, max_members, auto_close_hours, current_key_epoch)
     VALUES (?, ?, ?, ?, ?, 'campfire', ?, ?, 1)`,
    spaceId,
    seedSpace.name,
    seedSpace.badge,
    seedSpace.iconType,
    seedSpace.themeColor,
    seedSpace.maxMembers,
    spaceId === 'camp-friends' ? 6 : null,
  );

  sql.exec(
    `INSERT OR REPLACE INTO space_members (member_id, user_id, role, override_name, override_avatar, override_bio, status_lamp, ephemeral_status_encrypted, ephemeral_status_expires_at, wrapped_space_key)
     VALUES (?, ?, 'admin', ?, 'hima', ?, 'free', ?, ?, 'wrapped_smk_ep1_hima')`,
    'mem-hima',
    'user_hima_01',
    seedSpace.myOverrideName,
    seedSpace.myOverrideBio,
    encodeSeedEnvelope('ほうじ茶淹れました🍵'),
    '45分後消滅',
  );

  seedSpace.channels.forEach((ch, idx) => {
    const pinnedJson = JSON.stringify(ch.pinnedTopic);
    sql.exec(
      `INSERT OR REPLACE INTO channels (
        id, space_id, name, emojis, badge_text, icon_type, sort_order,
        pinned_topic_encrypted, is_read_visible, is_typing_visible,
        is_thread_enabled, is_mention_enabled, is_anonymous_mode, is_ephemeral
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ch.id,
      spaceId,
      ch.name,
      ch.emojis,
      ch.badgeText,
      ch.iconType,
      idx,
      encodeSeedEnvelope(pinnedJson),
      ch.settings.isReadVisible ? 1 : 0,
      ch.settings.isTypingVisible ? 1 : 0,
      ch.settings.isThreadEnabled ? 1 : 0,
      ch.settings.isMentionEnabled ? 1 : 0,
      ch.settings.isAnonymousMode ? 1 : 0,
      ch.settings.isEphemeral ? 1 : 0,
    );

    const channelMsgs = INITIAL_MESSAGES[ch.id] ?? [];
    for (const msg of channelMsgs) {
      sql.exec(
        `INSERT OR REPLACE INTO messages (
          id, channel_id, parent_message_id, sender_member_id, sender_name,
          avatar_type, status_lamp, ciphertext, iv, key_epoch,
          workflow_type, workflow_payload_encrypted, media_payload_encrypted,
          delivery_mode, expires_at, is_edited, read_count, created_at, updated_at
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 'seed_iv_12b', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        msg.id,
        ch.id,
        msg.senderMemberId,
        msg.senderName,
        msg.avatarType,
        msg.statusLamp,
        encodeSeedEnvelope(msg.content),
        msg.keyEpoch,
        msg.workflow?.type ?? null,
        msg.workflow ? encodeSeedEnvelope(JSON.stringify(msg.workflow)) : null,
        msg.media ? encodeSeedEnvelope(JSON.stringify(msg.media)) : null,
        msg.deliveryMode ?? 'instant',
        msg.expiresIn ?? null,
        msg.readCount ?? 1,
        msg.timestamp,
        msg.timestamp,
      );

      for (const r of msg.reactions) {
        for (let c = 0; c < r.count; c += 1) {
          const reactorId = c === 0 && r.me ? 'mem-hima' : `mem-peer-${c}`;
          sql.exec(
            'INSERT OR IGNORE INTO reactions (message_id, member_id, emoji_code) VALUES (?, ?, ?)',
            msg.id,
            reactorId,
            r.emojiCode,
          );
        }
      }

      const replies = INITIAL_THREAD_REPLIES[msg.id] ?? [];
      for (const th of replies) {
        sql.exec(
          `INSERT OR REPLACE INTO messages (
            id, channel_id, parent_message_id, sender_member_id, sender_name,
            avatar_type, status_lamp, ciphertext, iv, key_epoch,
            workflow_type, workflow_payload_encrypted, media_payload_encrypted,
            delivery_mode, expires_at, is_edited, read_count, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'free', ?, 'seed_iv_12b', 1, NULL, NULL, NULL, 'instant', NULL, 0, 1, ?, ?)`,
          th.id,
          ch.id,
          msg.id,
          th.isOwn ? 'mem-hima' : 'mem-peer',
          th.senderName,
          th.avatarType,
          encodeSeedEnvelope(th.content),
          th.timestamp,
          th.timestamp,
        );
      }
    }
  });

  for (const em of INITIAL_CUSTOM_EMOJIS) {
    sql.exec(
      `INSERT OR REPLACE INTO custom_emojis (id, name, shortcode, label, preview_char, image_url, uploaded_by_member_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      em.id,
      em.shortcode.replace(/:/g, ''),
      em.shortcode,
      em.label,
      em.previewChar,
      `/api/media/emojis-irori-main-${em.id}`,
      em.uploadedBy,
      em.createdAt,
    );
  }
}

export function seedTestUserSql(
  sql: SqlStorageLike,
  userId = 'user_hima_01',
): void {
  for (const stmt of USER_ACTOR_DDL.split(';')
    .map((s) => s.trim())
    .filter(Boolean)) {
    sql.exec(stmt);
  }

  sql.exec(
    `INSERT OR REPLACE INTO profile (
      user_id, google_sub, default_name, default_avatar, status_lamp, ephemeral_memo,
      public_key, encrypted_backup_user_key, pin_salt, pin_auth_hash,
      failed_pin_attempts, pin_locked_until
    ) VALUES (?, 'google_sub_hima_01', 'Hima (あなた)', 'hima', 'free', 'ほうじ茶淹れました🍵', 'ecdh_p256_pub_hima_v1', NULL, 'irori_user_salt_2026_v1', NULL, 0, NULL)`,
    userId,
  );

  for (const sp of INITIAL_SPACES) {
    sql.exec(
      `INSERT OR REPLACE INTO joined_spaces (
        space_id, space_name, theme_color, role, unread_count, has_quiet_activity, notification_level
      ) VALUES (?, ?, ?, 'admin', ?, ?, ?)`,
      sp.id,
      sp.name,
      sp.themeColor,
      sp.unreadCount,
      sp.hasQuietActivity ? 1 : 0,
      sp.notificationLevel,
    );
  }

  for (const bm of INITIAL_BOOKMARKS) {
    sql.exec(
      `INSERT OR REPLACE INTO bookmarks (
        id, space_id, channel_id, channel_name, message_id, sender_name,
        encrypted_message_snapshot, encrypted_private_note, iv, tags, created_at
      ) VALUES (?, 'irori-main', 'takibi', ?, ?, ?, ?, ?, 'seed_iv_12b', ?, ?)`,
      bm.id,
      bm.channelName,
      bm.messageId,
      bm.senderName,
      encodeSeedEnvelope(bm.messageExcerpt),
      encodeSeedEnvelope(bm.privateNote),
      JSON.stringify(bm.tags),
      bm.createdAt,
    );
  }
}

const isMainModule =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  process.argv[1].endsWith('seed-test-space.ts');

if (isMainModule) {
  console.log(
    '[Irori Seed CLI] テストスペース定義 (INITIAL_SPACES:',
    INITIAL_SPACES.map((s) => `${s.id} (${s.name})`).join(', '),
    ') の準備が完了しています。',
  );
}
