# ページ・コンポーネント設計書：Irori（イロリ）

## 1. 画面構成・ルーティング・レスポンシブ方針

初期フェーズでは、すべての主要機能を 1 つのダッシュボード型画面に集約する。ルーム切り替え時の WebSocket 接続や、型安全なデータフェッチをスムーズに行うため、Next.js の動的ルーティングを採用する。モバイルでも使いやすいよう、段階的縮退に基づくレスポンシブ設計とする。

### 1.0 技術前提

- フロントエンド: Next.js (App Router) + Tailwind CSS v4 + shadcn/ui + @base-ui/react
- キャッシュ・データフェッチ: TanStack Query v5 + Hono Type-safe RPC
- グローバル状態管理: Zustand (UI状態、WebSocketインスタンス、タイピング気配の同期用)
- データベース: Cloudflare D1
- リアルタイム: WebSocket / Durable Objects
- 命名規約: API/フロントエンドは camelCase、DB は snake_case

### 1.1 ルーティング一覧

- `/`: ランディングページ（LP）。サービス説明、ログイン・登録、ルーム招待リンク入力などを提供する。
- `/app`: アプリ本体のホーム。
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
│   │   ├── create-room-dialog.tsx
│   │   ├── room-list.tsx
│   │   ├── sidebar-container.tsx
│   │   └── status-lamp-picker.tsx
│   ├── settings/                # ルーム設定（右カラム）関連
│   │   └── settings-panel.tsx
│   ├── layout/                  # レスポンシブ用共有コンポーネント
│   │   └── mobile-header.tsx    # モバイル・タブレット用ヘッダー
│   └── ui/                      # 汎用プリミティブ（shadcn / base-ui）
├── hooks/                       # hooks層
│   ├── useRoomQuery.ts
│   └── useRoomWebSocket.ts
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
- `isEphemeral`: boolean (ルーム自体の永続属性)
- `roomSettings`: `RoomSettings`
- `messages`: `Message[]` (TanStack Query から提供されるデータ群)
- `typingUsers`: `Array<{ id: string; name: string }>` (Zustand から提供されるリアルタイムデータ)
- `isSidebarOpen`: boolean (Zustand)
- `isSettingsOpen`: boolean (Zustand)

**Stories**

- `Default`: 3カラムデスクトップ表示、既読/タイピングオン、通常メッセージ群。
- `Mobile`: モバイル表示、サイドバーと設定パネルがドロワーとして隠れる状態。
- `EphemeralRoom`: `isEphemeral = true` の一時チャットルーム。画面ヘッダー等に「24時間で消滅」のインジケーターが表示され、設定パネルから一時モードのトグルは表示されない。
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
- `onOpenCreateRoomDialog`: `() => void` — Zustand の `isCreateRoomDialogOpen` を `true` に切り替え、`CreateRoomDialog` を開く
- `onInviteFriend`: `() => void`

**Stories**

- `Default`: ルーム一覧とステータスピッカーを含む標準表示。
- `NoRooms`: ルーム未参加状態の資料表示。
- `WithUnread`: 未読バッジ付きルームが並ぶ状態。
- `CreateRoomDialogOpen`: ルーム作成ダイアログが表示されている状態。`CreateRoomDialog` が `SidebarContainer` の子として描画される。

**Notes**

- モバイルでは `SidebarContainer` がドロワーとして表示されるため、`isOpen` などの状態を Args で切り替えて確認する。
- サイドバー内の「＋ ルームを作成」ボタン押下で `onOpenCreateRoomDialog` が発火し、`CreateRoomDialog` を表示する。モバイルではサイドバードロワーを閉じずにダイアログをオーバーレイで表示する設計とする。

#### `CreateRoomDialog` / `components/sidebar/create-room-dialog.tsx`

**Storybook metadata**

- title: `App/Sidebar/CreateRoomDialog`
- component: `CreateRoomDialog`

**概要**

ルーム新規作成時に表示されるモーダルダイアログ。ルーム名入力に加え、「一時チャットモードにする」チェックボックスを配置する。一時チャットモードを ON にすると、作成されるルームは 24 時間でメッセージが自動消滅する Ephemeral Room として作成される。この属性は**作成後に変更できない**ため、チェックボックスの横に注意喚起のツールチップまたはヘルプテキストを表示する。

**Args**

- `isOpen`: boolean — Zustand の `isCreateRoomDialogOpen` と連動。`true` のときダイアログを表示する
- `onClose`: `() => void` — Zustand の `isCreateRoomDialogOpen` を `false` に切り替える
- `onSubmit`: `(payload: { roomName: string; isEphemeral: boolean }) => void` — TanStack Query の Mutation を発火してルーム作成 API を呼び出す

**内部状態（ローカル state）**

- `roomName`: string — ルーム名の入力値
- `isEphemeral`: boolean — 「一時チャットモードにする」チェックボックスの真偽値（デフォルト: `false`）

**UIレイアウト**

1. **ルーム名入力フィールド**: テキスト入力。バリデーションとして空欄不可・最大文字数制限を設ける
2. **「一時チャットモードにする」チェックボックス**:
   - ラベル: `一時チャットモードにする`
   - サブラベル / ヘルプテキスト: `ONにすると、メッセージは24時間後に自動で消滅します。この設定はルーム作成後に変更できません。`
   - チェック ON 時に注意喚起として背景色またはアイコンで視覚的フィードバックを与える
3. **アクションボタン**: 「キャンセル」（`onClose` 発火）と「作成」（`onSubmit` 発火）

**Zustand 連動**

- `SidebarContainer` 内の「＋ ルームを作成」ボタンが押されると、Zustand の `isCreateRoomDialogOpen` が `true` になり、`CreateRoomDialog` が表示される
- ダイアログのキャンセルまたは作成完了時に `isCreateRoomDialogOpen` が `false` に戻る
- モバイル表示時: `isSidebarOpen` が `true` の状態でダイアログがオーバーレイ表示される。ダイアログを閉じてもサイドバーは閉じない

**Stories**

- `Default`: ダイアログが開いている状態。チェックボックスは OFF。
- `EphemeralChecked`: 「一時チャットモードにする」が ON の状態。注意喚起のヘルプテキストが強調表示される。
- `ValidationError`: ルーム名が空欄のまま「作成」を押した場合のバリデーションエラー表示。
- `Mobile`: モバイル幅でのダイアログ表示。サイドバードロワーの上にオーバーレイされる。

**Notes**

- 一時チャットモードの選択は**不可逆**であるため、UX上で明確に警告する。チェック ON 時に確認ステップ（インラインの警告表示）を挟む設計を推奨する。
- `isEphemeral` はルーム作成 API (`POST /api/v1/rooms`) のリクエストボディに含まれ、サーバー側で `rooms` テーブルの `is_ephemeral` カラムに永続化される。

---

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
- `isEphemeral`: boolean (設定変更はできないが、状態表示のために受け取る)
- `isAdmin`: boolean
- `onToggleSetting`: `(key: keyof RoomSettings, value: boolean) => void` (TanStack Query の Mutation を発火)

**Stories**

- `Default`: 標準設定パネル（既読、タイピング、スレッド、メンションのトグル）。
- `InEphemeralRoom`: `isEphemeral = true` の場合の表示。設定トグルとは別に、上部に「このルームは一時チャットモードです（24時間でメッセージが消滅します）」という案内バッジを固定表示する。

**Notes**

- モバイル表示では各トグルのタップターゲットを 44px 以上に確保したレイアウトを Storybook 上で確認する。

---

## 4. 状態管理（State）とデータフロー設計

Irori では複雑なリアルタイム通信とクリーンなUI描写を両立するため、状態管理の責務を以下のように2分割する。

### 4.1 サーバー状態（TanStack Query）

API を経由して D1 と同期する、一貫性が求められるデータ。

- **Room List**: 参加しているルーム一覧
- **Room Details & Settings**: 現在のルームのトグル設定項目
- **Message History**: 過去のチャットログ（無限スクロール・カーソルフェッチ）
- **User Profile**: ログインユーザー自身のメタデータ

### 4.2 クライアント・リアルタイム状態（Zustand）

コンポーネントツリー全体で高速に共有したいUIの状態、および不変の永続的な接続インスタンス。

- **UI Toggles**: `isSidebarOpen`, `isSettingsOpen`, `isCreateRoomDialogOpen` の真偽値
- **Active Room**: 現在選択されている `activeRoomId`
- **WebSocket Instance**: サーバーと常時接続している `WebSocket` オブジェクトの実体（コンポーネントの再レンダリングで切断されないようグローバルに保持）
- **Typing Status**: WebSocket経由で流れてくる、ルーム内で現在タイピングしているユーザーIDの配列 (`typingUsers`)

> **`isCreateRoomDialogOpen` について**: ルーム作成ダイアログの開閉状態を管理する。`SidebarContainer` 内の「＋ ルームを作成」ボタンで `true` に切り替わり、`CreateRoomDialog` のキャンセル・作成完了で `false` に戻る。モバイル表示では `isSidebarOpen` と独立して管理され、ダイアログを閉じてもサイドバーは開いたまま維持される。

### 4.3 リアルタイム・データフロー（結合イベント）

1. クライアントがメッセージを入力し送信 ➡️ HTTP `POST /api/v1/rooms/:roomId/messages` を叩く。
2. サーバー（Hono）がD1テーブル（通常 or 一時）に保存成功後、Durable Objects経由でルームの WebSocket 接続者全員に `type: "NEW_MESSAGE"` をブロードキャスト。
3. 受信したクライアントの WebSocket リスナー（コンポーネント外）が検知。
4. リスナー内部で TanStack Query の `queryClient.setQueryData` を呼び出し、該当ルームのメッセージ履歴キャッシュに受信データを直接プッシュしてタイムラインを即座に更新する。

## 5. UIコンポーネント・選定方針

- **ベース・プリミティブ**: `@base-ui/react` (Base UI)
  - スタイルレスな構造を徹底し、Tailwind CSS v4 のレスポンシブクエリ（`md:` , `xl:`）と直接結合させる。
- **ドロワー/シート実装**: `shadcn/ui (Sheetコンポーネント)`
  - 内部的に `Radix Dialog` を使用しており、モバイルのアクセシビリティ（フォーカスロック、背景オーバーレイ、エスケープキーでの閉鎖、画面外タップ対応）を完全に満たしたレスポンシブメニューが最小限のコードで実現可能。
