import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

// 1. Users
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  googleOauthId: text('google_oauth_id').unique(),
  statusLamp: text('status_lamp', { enum: ['free', 'busy', 'away'] })
    .notNull()
    .default('free'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

// 2. Friend Connections
export const friendConnections = sqliteTable(
  'friend_connections',
  {
    userIdA: text('user_id_a')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userIdB: text('user_id_b')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userIdA, table.userIdB] }),
  })
);

// 3. Rooms
export const rooms = sqliteTable('rooms', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  // D1(SQLite)のbooleanは 0/1 のINTEGERとして扱う
  isEphemeral: integer('is_ephemeral', { mode: 'boolean' })
    .notNull()
    .default(false),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

// 4. Room Members
export const roomMembers = sqliteTable(
  'room_members',
  {
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['admin', 'member'] })
      .notNull()
      .default('member'),
    joinedAt: text('joined_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.roomId, table.userId] }),
  })
);

// 5. Room Settings
export const roomSettings = sqliteTable('room_settings', {
  roomId: text('room_id')
    .primaryKey()
    .references(() => rooms.id, { onDelete: 'cascade' }),
  isReadVisible: integer('is_read_visible', { mode: 'boolean' })
    .notNull()
    .default(true),
  isTypingVisible: integer('is_typing_visible', { mode: 'boolean' })
    .notNull()
    .default(true),
  isThreadEnabled: integer('is_thread_enabled', { mode: 'boolean' })
    .notNull()
    .default(true),
  isMentionEnabled: integer('is_mention_enabled', { mode: 'boolean' })
    .notNull()
    .default(true),
});

// 6. Messages (通常ルーム用)
export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    content: text('content').notNull(),
    mediaUrl: text('media_url'),
    replyToId: text('reply_to_id'), // 自己参照は型解決が複雑になるためプレーンなtextで定義
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    roomIdIdx: index('idx_messages_room_id_created_at').on(
      table.roomId,
      table.createdAt
    ),
  })
);

// 7. Ephemeral Messages (一時チャットルーム用)
export const ephemeralMessages = sqliteTable(
  'ephemeral_messages',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    content: text('content').notNull(),
    mediaUrl: text('media_url'),
    replyToId: text('reply_to_id'),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    roomIdIdx: index('idx_ephemeral_messages_room_id_created_at').on(
      table.roomId,
      table.createdAt
    ),
    createdAtIdx: index('idx_ephemeral_messages_created_at').on(
      table.createdAt
    ),
  })
);
