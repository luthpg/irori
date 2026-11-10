/**
 * requirements.md 5.1: UserActor 内蔵 SQLite スキーマ定義 (全4テーブル)
 * ユーザー個人単位で物理分離された SQLite ストレージ。
 * 実行時コードにはモックデータの自動シード分岐を含めない。
 */
export const USER_ACTOR_DDL = `
CREATE TABLE IF NOT EXISTS profile (
  user_id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE,
  default_name TEXT NOT NULL,
  default_avatar TEXT NOT NULL DEFAULT 'hima',
  status_lamp TEXT NOT NULL DEFAULT 'free',
  ephemeral_memo TEXT NOT NULL DEFAULT '',
  enter_key_behavior TEXT NOT NULL DEFAULT 'newline',
  public_key TEXT NOT NULL,
  encrypted_backup_user_key TEXT,
  pin_salt TEXT NOT NULL,
  pin_auth_hash TEXT,
  failed_pin_attempts INTEGER NOT NULL DEFAULT 0,
  pin_locked_until TEXT
);

CREATE TABLE IF NOT EXISTS joined_spaces (
  space_id TEXT PRIMARY KEY,
  space_name TEXT NOT NULL,
  theme_color TEXT NOT NULL DEFAULT 'amber',
  role TEXT NOT NULL DEFAULT 'admin',
  unread_count INTEGER NOT NULL DEFAULT 0,
  has_quiet_activity INTEGER NOT NULL DEFAULT 1,
  notification_level TEXT NOT NULL DEFAULT 'mentions'
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  message_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  encrypted_message_snapshot TEXT NOT NULL,
  encrypted_private_note TEXT NOT NULL,
  iv TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pending_deliveries (
  id TEXT PRIMARY KEY,
  target_user_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  trigger_type TEXT NOT NULL DEFAULT 'when_free',
  scheduled_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS qr_sync_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ephemeral_public_key TEXT NOT NULL,
  sender_public_key TEXT,
  encrypted_key_bundle TEXT,
  iv TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TEXT NOT NULL
);
`;
