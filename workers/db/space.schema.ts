export function encodeSeedEnvelope(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `e2ee_v1:${btoa(binary)}`;
}

/**
 * requirements.md 5.2: SpaceActor 内蔵 SQLite スキーマ定義 (全8テーブル)
 * SQLite カラム名は snake_case 規約に準拠。
 * 実行時コードにはモックデータの自動シード分岐を含めない。
 */
export const SPACE_ACTOR_DDL = `
CREATE TABLE IF NOT EXISTS space_meta (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  badge TEXT NOT NULL DEFAULT '完全招待制',
  icon_type TEXT NOT NULL DEFAULT 'flame',
  theme_color TEXT NOT NULL DEFAULT 'amber',
  ambient_sound TEXT NOT NULL DEFAULT 'campfire',
  max_members INTEGER NOT NULL DEFAULT 6,
  auto_close_hours INTEGER,
  current_key_epoch INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS space_members (
  member_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  override_name TEXT NOT NULL,
  override_avatar TEXT NOT NULL DEFAULT 'hima',
  override_bio TEXT NOT NULL DEFAULT '',
  status_lamp TEXT NOT NULL DEFAULT 'free',
  ephemeral_status_encrypted TEXT,
  ephemeral_status_expires_at TEXT,
  wrapped_space_key TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  name TEXT NOT NULL,
  emojis TEXT NOT NULL DEFAULT '🔥 👥',
  badge_text TEXT NOT NULL DEFAULT '完全招待制',
  icon_type TEXT NOT NULL DEFAULT 'green-dot',
  sort_order INTEGER NOT NULL DEFAULT 0,
  pinned_topic_encrypted TEXT NOT NULL,
  is_read_visible INTEGER NOT NULL DEFAULT 0,
  is_typing_visible INTEGER NOT NULL DEFAULT 1,
  is_thread_enabled INTEGER NOT NULL DEFAULT 1,
  is_mention_enabled INTEGER NOT NULL DEFAULT 1,
  is_anonymous_mode INTEGER NOT NULL DEFAULT 0,
  is_ephemeral INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  parent_message_id TEXT,
  sender_member_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  avatar_type TEXT NOT NULL DEFAULT 'hima',
  status_lamp TEXT NOT NULL DEFAULT 'free',
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  key_epoch INTEGER NOT NULL DEFAULT 1,
  workflow_type TEXT,
  workflow_payload_encrypted TEXT,
  media_payload_encrypted TEXT,
  media_r2_key TEXT,
  delivery_mode TEXT NOT NULL DEFAULT 'instant',
  expires_at TEXT,
  is_edited INTEGER NOT NULL DEFAULT 0,
  read_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reactions (
  message_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  emoji_code TEXT NOT NULL,
  PRIMARY KEY (message_id, member_id, emoji_code)
);

CREATE TABLE IF NOT EXISTS custom_emojis (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  shortcode TEXT NOT NULL,
  label TEXT NOT NULL,
  preview_char TEXT NOT NULL DEFAULT '🔥',
  image_url TEXT NOT NULL,
  uploaded_by_member_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS read_cursors (
  channel_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  last_read_message_id TEXT,
  last_read_at TEXT NOT NULL,
  is_manually_unread INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (channel_id, member_id)
);

CREATE TABLE IF NOT EXISTS shared_notes (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  title_encrypted TEXT NOT NULL,
  body_encrypted TEXT NOT NULL,
  iv TEXT NOT NULL,
  is_pinned INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhooks (
  token TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  label TEXT NOT NULL,
  created_by_member_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

export interface SqlStorageLike {
  exec(
    query: string,
    ...bindings: unknown[]
  ): { toArray(): Record<string, unknown>[] };
}
