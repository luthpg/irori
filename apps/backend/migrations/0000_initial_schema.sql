-- 一旦既存テーブルがあれば削除する（ローカル開発中のリセット用）
DROP TABLE IF EXISTS ephemeral_messages;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS room_settings;
DROP TABLE IF EXISTS room_members;
DROP TABLE IF EXISTS rooms;
DROP TABLE IF EXISTS friend_connections;
DROP TABLE IF EXISTS users;

-- 1. Users
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  google_oauth_id TEXT UNIQUE,
  status_lamp TEXT NOT NULL DEFAULT 'free' CHECK(status_lamp IN ('free', 'busy', 'away')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Friend Connections
CREATE TABLE friend_connections (
  user_id_a TEXT NOT NULL,
  user_id_b TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id_a, user_id_b),
  FOREIGN KEY (user_id_a) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id_b) REFERENCES users(id) ON DELETE CASCADE,
  -- A-B と B-A の重複登録を防ぐため、常に id の文字列順（A < B）で保存させる制約
  CHECK (user_id_a < user_id_b) 
);

-- 3. Rooms
CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_ephemeral INTEGER NOT NULL DEFAULT 0, -- 0: 通常ルーム, 1: 一時チャットルーム
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Room Members
CREATE TABLE room_members (
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member', -- 'admin' or 'member'
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (room_id, user_id),
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 5. Room Settings
CREATE TABLE room_settings (
  room_id TEXT PRIMARY KEY,
  is_read_visible INTEGER NOT NULL DEFAULT 1,
  is_typing_visible INTEGER NOT NULL DEFAULT 1,
  is_thread_enabled INTEGER NOT NULL DEFAULT 1,
  is_mention_enabled INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- 6. Messages (通常ルーム用)
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  user_id TEXT, -- ユーザー退会時は NULL にして「退会したユーザー」として扱うため SET NULL
  content TEXT NOT NULL,
  media_url TEXT,
  reply_to_id TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL
);
-- ルームを開いた際のタイムライン取得を高速化
CREATE INDEX idx_messages_room_id_created_at ON messages(room_id, created_at DESC);

-- 7. Ephemeral Messages (一時チャットルーム用)
CREATE TABLE ephemeral_messages (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  user_id TEXT,
  content TEXT NOT NULL,
  media_url TEXT,
  reply_to_id TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- 一時チャットは更新不要な想定のため updated_at は除外
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (reply_to_id) REFERENCES ephemeral_messages(id) ON DELETE SET NULL
);
-- ルームを開いた際のタイムライン取得用
CREATE INDEX idx_ephemeral_messages_room_id_created_at ON ephemeral_messages(room_id, created_at DESC);
-- ★超重要: Cronによる24時間経過データの物理削除 (DELETE) を高速化するためのインデックス
CREATE INDEX idx_ephemeral_messages_created_at ON ephemeral_messages(created_at);