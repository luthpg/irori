# ページ・コンポーネント設計書：Irori（イロリ）

## 1. 画面構成・ルーティング・レスポンシブ方針
初期フェーズでは、すべての主要機能を 1 つのダッシュボード型画面に集約する。ルーム切り替え時の WebSocket 接続や、型安全なデータフェッチをスムーズに行うため、Next.js の動的ルーティングを採用する。モバイルでも使いやすいよう、段階的縮退に基づくレスポンシブ設計とする。

### 1.0 技術前提
- フロントエンド: Next.js (App Router) + Tailwind CSS v4 + shadcn/ui + @base-ui/react
- バックエンド API: Hono + Cloudflare Workers + Type-safe RPC
- データベース: Cloudflare D1
- リアルタイム: WebSocket / Durable Objects
- 命名規約: API/フロントエンドは camelCase、DB は snake_case

### 1.1 ルーティング一覧
- `/`: ランディングページ（LP）。サービス説明、ログイン・登録、ルーム招待リンク入力などを提供する。
- `/app`: アプリ本体のホーム。デスクトップではサイドバーを表示し、中央・右カラムは未選択状態のプレースホルダーを表示する。モバイルではルーム一覧を優先表示する。
- `/app/rooms/[roomId]`: 指定ルームのメインチャット画面。チャットタイムラインと設定パネルを動的に読み込み、WebSocket を接続する。

### 1.2 レスポンシブ・ブレイクポイント設計
Tailwind CSS の標準ブレイクポイントに準拠する。
- モバイル（`md` 未満）: 1 カラム表示。サイドバーと設定はドロワーとして扱う。
- タブレット（`md` 以上 `xl` 未満）: 2 カラム表示。サイドバーとチャットを固定し、設定だけドロワーにする。
- デスクトップ（`xl` 以上）: 3 カラム表示。左・中央・右の 3 カラムを既定表示とする。

---

## 2. フロントエンド・ディレクトリ構造
コンポーネントの再利用性とモノレポの保守性を高めるため、役割ごとに明確に分割する。

```
apps/frontend/
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   ├── page.tsx                 # `/` ランディングページ
│   ├── app/
│   │   ├── page.tsx             # `/app` ホーム
│   │   └── rooms/
│   │       └── [roomId]/
│   │           └── page.tsx     # `/app/rooms/[roomId]` メイン画面
├── components/
│   ├── chat/                    # チャット（中央カラム）関連
│   │   ├── chat-area.tsx
│   │   ├── message-bubble.tsx
│   │   ├── message-input.tsx
│   │   └── ogp-preview.tsx
│   ├── sidebar/                 # サイドバー（左カラム）関連
│   │   ├── room-list.tsx
│   │   ├── sidebar-container.tsx
│   │   └── status-lamp-picker.tsx
│   ├── settings/                # ルーム設定（右カラム）関連
│   │   └── settings-panel.tsx
│   ├── layout/                  # レスポンシブ用共有コンポーネント
│   │   └── mobile-header.tsx    # モバイル・タブレット用ヘッダー
│   └── ui/                      # 汎用プリミティブ（shadcn / base-ui）
└── lib/
    ├── api.ts                   # Hono hc クライアント
    └── utils.ts
```

---

## 3. Storybook 形式コンポーネント設計

### 3.1 `RoomPage` / `app/rooms/[roomId]/page.tsx`
**Storybook metadata**
- title: `App/Rooms/RoomPage`
- component: `RoomPage`

**Args**
- `roomId`: string
- `roomName`: string
- `roomSettings`: `RoomSettings`
- `messages`: `Message[]`
- `typingUsers`: `Array<{ id: string; name: string }>`
- `isSidebarOpen`: boolean
- `isSettingsOpen`: boolean

**Stories**
- `Default`: 3カラムデスクトップ表示、既読/タイピングオン、通常メッセージ群。
- `Mobile`: モバイル表示、サイドバーと設定パネルがドロワーとして隠れる状態。
- `EphemeralRoom`: `roomSettings.isEphemeralMode = true`、一時チャットが有効なルーム。
- `TypingUsers`: タイピングインジケーターの表示を確認するストーリー。

**Notes**
- WebSocket イベントは Storybook 環境ではモック化し、`onMessage` によるメッセージ追加・編集・削除を再現する。
- レスポンシブ制御は `className` ベースでシミュレーションし、`xl:` ブレークポイント以下で `Sheet` を利用した左右ドローイングを確認する。

---

### 3.2 サイドバー関連

#### `SidebarContainer` / `components/sidebar/sidebar-container.tsx`
**Storybook metadata**
- title: `App/Sidebar/SidebarContainer`
- component: `SidebarContainer`

**Args**
- `status`: `"free" | "busy" | "away"`
- `rooms`: `Array<{ id: string; name: string; unreadCount?: number }>`
- `onSelectRoom`: `(roomId: string) => void`
- `onCreateRoom`: `() => void`
- `onInviteFriend`: `() => void`

**Stories**
- `Default`: ルーム一覧とステータスピッカーを含む標準表示。
- `NoRooms`: ルーム未参加状態の資料表示。
- `WithUnread`: 未読バッジ付きルームが並ぶ状態。

**Notes**
- モバイルでは `SidebarContainer` がドロワーとして表示されるため、`isOpen` などの状態を Args で切り替えて確認する。

#### `StatusLampPicker` / `components/sidebar/status-lamp-picker.tsx`
**Storybook metadata**
- title: `App/Sidebar/StatusLampPicker`
- component: `StatusLampPicker`

**Args**
- `value`: `"free" | "busy" | "away"`
- `disabled`: boolean
- `onChange`: `(value: string) => void`

**Stories**
- `Free`: `value = "free"`
- `Busy`: `value = "busy"`
- `Away`: `value = "away"`
- `Disabled`: `disabled = true`
- `PopoverOpen`: ポップオーバーが開いている状態をモック表示する場合の変種。

**Notes**
- ラベルは UI 上で `ひま / 作業中 / 離席` にマッピングし、色はそれぞれ `bg-lamp-free` / `bg-lamp-busy` / `bg-lamp-away` を使用する。

#### `RoomList` / `components/sidebar/room-list.tsx`
**Storybook metadata**
- title: `App/Sidebar/RoomList`
- component: `RoomList`

**Args**
- `rooms`: `Array<{ id: string; name: string; unreadCount?: number; isActive?: boolean }>`
- `selectedRoomId`: string
- `onSelectRoom`: `(roomId: string) => void`

**Stories**
- `Default`: 参加中ルーム一覧を表示。
- `SelectedRoom`: 1つのルームが選択状態。
- `WithUnreadCounts`: 未読バッジが表示されたルーム一覧。

**Notes**
- モバイルではタップ時に `onSelectRoom` が呼ばれ、ドロワー閉鎖をトリガーする設計にする。

---

### 3.3 チャットエリア関連

#### `MobileHeader` / `components/layout/mobile-header.tsx`
**Storybook metadata**
- title: `App/Layout/MobileHeader`
- component: `MobileHeader`

**Args**
- `roomName`: string
- `showSidebarButton`: boolean
- `showSettingsButton`: boolean
- `onOpenSidebar`: `() => void`
- `onOpenSettings`: `() => void`

**Stories**
- `Default`: モバイル表示で両アイコンが表示される状態。
- `Tablet`: ハンバーガーボタン非表示、設定ボタンのみ表示。
- `Desktop`: 完全非表示（`xl:hidden`）の想定をドキュメントで確認する。

**Notes**
- Storybook では `showSidebarButton` / `showSettingsButton` の変数を切り替えることで、各ブレークポイント時の UIを確認する。

#### `ChatArea` / `components/chat/chat-area.tsx`
**Storybook metadata**
- title: `App/Chat/ChatArea`
- component: `ChatArea`

**Args**
- `messages`: `Message[]`
- `isLoading`: boolean
- `onScrollBottom`: `() => void`

**Stories**
- `Default`: 通常のチャットタイムライン。
- `Loading`: メッセージ読み込み中のプレースホルダーを表示。
- `LongConversation`: ロングコンテンツのスクロール挙動を検証。

**Notes**
- `flex-1 overflow-y-auto` の挙動は Storybook 上で `height` を制約して確認する。

#### `MessageBubble` / `components/chat/message-bubble.tsx`
**Storybook metadata**
- title: `App/Chat/MessageBubble`
- component: `MessageBubble`

**Args**
- `authorName`: string
- `content`: string
- `isOwnMessage`: boolean
- `createdAt`: string
- `isEditing`: boolean
- `hasActions`: boolean
- `mediaUrl?`: string
- `replyTo?`: `{ id: string; content: string; authorName: string }`

**Stories**
- `Default`: 標準メッセージ表示。
- `OwnMessage`: 自分のメッセージとして右寄せ表示。
- `WithMedia`: Google Drive / Photos 共有リンクプレビュー付き。
- `WithReply`: 引用返信付き表示。
- `ActionMenu`: 編集・削除・引用ボタンを表示する状態。

**Notes**
- モバイルでは長押し/メニューアイコンのアクションシート、デスクトップではホバーアクションを別個に表現する。

#### `MessageInput` / `components/chat/message-input.tsx`
**Storybook metadata**
- title: `App/Chat/MessageInput`
- component: `MessageInput`

**Args**
- `value`: string
- `isMobile`: boolean
- `isSending`: boolean
- `onSubmit`: `(content: string) => void`
- `onOpenPicker`: `() => void`

**Stories**
- `Default`: 通常の入力フォーム。
- `Mobile`: 送信ボタン付きのモバイル版。
- `Sending`: 送信中のローディング状態。

**Notes**
- `isMobile` を切り替えて、Enter送信と明示的送信ボタンの表示差を検証する。

---

### 3.4 設定パネル関連

#### `SettingsPanel` / `components/settings/settings-panel.tsx`
**Storybook metadata**
- title: `App/Settings/SettingsPanel`
- component: `SettingsPanel`

**Args**
- `settings`: `RoomSettings`
- `isAdmin`: boolean
- `onToggleSetting`: `(key: keyof RoomSettings, value: boolean) => void`

**Stories**
- `Default`: 標準設定パネル。
- `EphemeralEnabled`: `isEphemeralMode` が有効な状態。
- `ReadReceiptDisabled`: `isReadVisible` がオフの状態。

**Notes**
- モバイル表示では各トグルのタップターゲットを 44px 以上に確保したレイアウトを Storybook 上で確認する。

---

## 4. 状態管理（State）とデータフロー設計

### 4.1 リアルタイムイベントハンドリング（WebSocket ➡️ React State）
バックエンドからブロードキャストされる各イベントに対して、フロントエンドの React State は以下のように追従する。

- **`NEW_MESSAGE`**: 受信したメッセージデータを `messages` 配列の末尾に結合。
- **`MESSAGE_EDIT`**: `messages.map(m => m.id === data.id ? { ...m, content: data.content, updatedAt: data.updatedAt } : m)` によりピンポイントで書き換え。
- **`MESSAGE_DELETE`**: `messages.filter(m => m.id !== data.id)` により画面から即座に消去。

### 4.2 未読戻し機能（Client-side Task Management）
- ルーム一覧の各項目では、デスクトップでは右クリックまたはダブルクリック、モバイルではスワイプまたは長押しで「未読に戻す」を実行できるようにする
- その状態はローカルストレージまたはクライアント状態で保持し、未読バッジを再表示する

---

## 5. UIコンポーネント・選定方針

- **ベース・プリミティブ**: `@base-ui/react` (Base UI)
  - スタイルレスな構造を徹底し、Tailwind CSS v4 のレスポンシブクエリ（`md:` , `xl:`）と直接結合させる。
- **ドロワー/シート実装**: `shadcn/ui (Sheetコンポーネント)`
  - 内部的に `Radix Dialog` を使用しており、モバイルのアクセシビリティ（フォーカスロック、背景オーバーレイ、エスケープキーでの閉鎖、画面外タップ対応）を完全に満たしたレスポンシブメニューが最小限のコードで実現可能。
