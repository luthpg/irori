# Irori（イロリ）API設計書

## 1. 概要

本設計書は、Irori の MVP 実装に向けた API 仕様書です。Next.js フロントエンドと Hono バックエンドをモノレポで構成し、HTTP API と WebSocket API を明確に分離して設計します。Hono の Type-safe RPC を前提に、フロントエンドとバックエンド間の型のズレを減らす方針とします。
フロントエンド側では、この RPC クライアントを TanStack Query と結合して非同期データを管理します。

---

## 2. ルーティング基本方針

- HTTP API はすべて `/api/v1` プレフィックスを付与する
- WebSocket API は `/ws` 直下に配置し、HTTP ルートとの混ざりを避ける
- メディアのバイナリ自体はアップロードしない。Google Picker で取得した共有 URL 文字列のみを送受信する

---

## 3. APIエンドポイント一覧

| カテゴリ | メソッド | パス | 概要 | リクエスト (Body / Query) | レスポンス (JSON) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ユーザー** | GET | `/api/v1/users/me` | 自身のプロフィール情報取得 | なし | `{ id: string, name: string, statusLamp: "free" \| "busy" \| "away" }` |
| **ユーザー** | PATCH | `/api/v1/users/status` | ステータスランプ（気配）の更新 | **Body**: `{ statusLamp: "free" \| "busy" \| "away" }` | `{ success: boolean }` |
| **フレンド** | GET | `/api/v1/friends` | つながっているフレンド一覧取得 | なし | `{ friends: Array<{ id: string, name: string, statusLamp: string }> }` |
| **フレンド** | POST | `/api/v1/friends/invite-code` | 招待リンク・QRコード用の固有コード生成 | なし | `{ inviteCode: string }` |
| **フレンド** | POST | `/api/v1/friends/connect` | 招待コードを用いたフレンド登録 | **Body**: `{ inviteCode: string }` | `{ success: boolean }` |
| **ルーム** | GET | `/api/v1/rooms` | 自分が参加しているルーム一覧取得 | なし | `{ rooms: Array<{ id: string, name: string, isEphemeral: boolean }> }` |
| **ルーム** | POST | `/api/v1/rooms` | 新しいルーム（囲炉裏）の作成 | **Body**: `{ name: string, isEphemeral: boolean }` | `{ id: string, name: string, isEphemeral: boolean }` |
| **ルーム** | GET | `/api/v1/rooms/:roomId` | 特定ルームの詳細およびトグル設定の取得 | なし | `{ id: string, name: string, isEphemeral: boolean, settings: RoomSettings }` |
| **ルーム** | PATCH | `/api/v1/rooms/:roomId/settings` | ルーム機能のトグル（ON/OFF）切り替え | **Body**: `Partial<RoomSettings>` (右記参照) | `{ success: boolean }` |
| **ルーム** | POST | `/api/v1/rooms/:roomId/invite` | 特定ルームへの招待用一時トークン生成 | なし | `{ token: string }` |
| **ルーム** | POST | `/api/v1/rooms/join` | 招待トークンを用いたルームへの新規入室 | **Body**: `{ token: string }` | `{ success: boolean }` |
| **メッセージ**| GET | `/api/v1/rooms/:roomId/messages` | 過去のメッセージ一覧取得（※裏でテーブル判定） | **Query**: `?cursor=string&limit=number` | `{ messages: Message[], nextCursor: string \| null }` |
| **メッセージ**| POST | `/api/v1/rooms/:roomId/messages` | 新規メッセージの投稿（※裏でテーブル判定） | **Body**: `{ content: string, mediaUrl?: string, replyToId?: string }` | `{ id: string, status: "saved" }` |
| **メディア** | POST | `/api/v1/media/preview` | Google Drive / Photos 共有URLから表示用プレビュー情報を取得 | **Body**: `{ url: string }` | `{ previewUrl: string, width: number, height: number, mimeType: string, title?: string }` |
| **メッセージ**| PUT | `/api/v1/messages/:messageId` | 送信済みメッセージの事後編集 | **Body**: `{ content: string }` | `{ success: boolean }` |
| **メッセージ**| DELETE | `/api/v1/messages/:messageId` | メッセージの送信取り消し（完全削除） | なし | `{ success: boolean }` |
| **外部連携** | POST | `/api/v1/webhooks/:webhookToken` | 外部（GitHub 等）からの機械的メッセージ投稿 | **Body**: `{ content: string }` | `{ success: boolean }` |
| **リアルタイム**| WS | `/ws/rooms/:roomId` | ルーム内のリアルタイム双方向通信 | JSON（詳細は後述） | JSON（詳細は後述） |

## 3.4 画像プレビューAPI

- `/api/v1/media/preview` は Google Drive / Photos の共有 URL を受け取り、チャット画面で表示可能なプレビュー画像 URL を返す。
- 画像の実体は引き続き Google 側に保持し、Irori 側ではメタデータのみを扱う。

## 型・命名規約

- API（HTTP / WebSocket）およびフロントエンド側では camelCase を採用します（例: `isReadVisible`）。
- データベースやストレージ層では snake_case を採用します（例: `is_read_visible`）。変換は ORM/データアクセス層で行ってください。

> **`RoomSettings` オブジェクトの型定義:**
>
> ```typescript
> type RoomSettings = {
>   isReadVisible: boolean;      // 既読の可視化
>   isTypingVisible: boolean;    // タイピング中表示
>   isThreadEnabled: boolean;    // スレッド機能
>   isMentionEnabled: boolean;   // メンション機能
> }
> ```

---

## 4. WebSocket イベント仕様 (`/ws/rooms/:roomId`)

WebSocket接続内では、すべて `type` プロパティを持ったJSON文字列を相互にパースして通信を行います。

### 4.1 クライアント ➡️ サーバー（ユーザーの行動を通知）

激しい状態変化を伴うイベントです。これらはDBには保存せず、メモリ（Durable Objects等）経由で即座にブロードキャストされます。

- **タイピング開始時**

  ```json
  { "type": "TYPING_START", "userId": "u_123" }
  ```

- **タイピング終了時（または入力停止から数秒経過時）**

  ```json
  { "type": "TYPING_STOP", "userId": "u_123" }
  ```

### 4.2 サーバー ➡️ クライアント（ルーム内の全員に一斉配信）

- **誰かが新規メッセージを投稿した時**
  HTTP の `POST /api/v1/rooms/:roomId/messages` が成功したタイミングで、バックエンドから接続中のメンバー全員に配信する。
  フロントエンド側では、TanStack Query の `queryClient.setQueryData` を用いて、既存のキャッシュメッセージ配列にこのデータを直接オプティミスティック（または追記）反映する。

  ```json
  {
    "type": "NEW_MESSAGE",
    "data": {
      "id": "m_999",
      "content": "今夜焚き火囲みませんか？",
      "mediaUrl": "https://drive.google.com/...",
      "userId": "u_123",
      "createdAt": "2026-07-10T00:00:00.000Z"
    }
  }
  ```

- **誰かがメッセージを編集した時**

  ```json
  {
    "type": "MESSAGE_EDIT",
    "data": { "id": "m_999", "content": "編集後のメッセージ", "updatedAt": "2026-07-10T00:05:00.000Z" }
  }
  ```

- **誰かがメッセージを削除した時**

  ```json
  {
    "type": "MESSAGE_DELETE",
    "data": { "id": "m_999" }
  }
  ```

- **誰かのタイピング状態が変化した時**
  フロントエンド側では、Zustand の `typingUsers` ストアを直接書き換えて高速にUIに反映する。

  ```json
  {
    "type": "USER_TYPING",
    "data": { "userId": "u_123", "isTyping": true }
  }
  ```

---

## 5. バックエンド（Hono）実装用コード構造例

本設計を整理して実装する際の、`apps/backend/src/index.ts` の基本構成例です。

```typescript
// apps/backend/src/index.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { upgradeWebSocket } from 'hono/cloudflare-workers'
import { usersRoutes } from './routes/users'
import { roomsRoutes } from './routes/rooms'

const app = new Hono()

// CORSの設定
app.use('/api/*', cors({ origin: (o) => o, credentials: true }))

// 明示的なルーティング結合により、WebSocketのパス巻き込みを完全に回避
const routes = app
  // === 1. HTTP REST エンドポイント ===
  .route('/api/v1/users', usersRoutes)
  .route('/api/v1/rooms', roomsRoutes)
  // メッセージの単体操作やWebhookなど、必要に応じて個別定義
  .put('/api/v1/messages/:messageId', (c) => c.json({ success: true }))
  .delete('/api/v1/messages/:messageId', (c) => c.json({ success: true }))
  .post('/api/v1/webhooks/:webhookToken', (c) => c.json({ success: true }))

  // === 2. WebSocket エンドポイント（独立配置） ===
  .get(
    '/ws/rooms/:roomId',
    upgradeWebSocket((c) => {
      const roomId = c.req.param('roomId')
      return {
        onMessage(event, ws) {
          // Durable Objects や マネージドPub/Subと連携してブロードキャスト処理を記述
          ws.send(JSON.stringify({ type: 'ECHO', data: event.data }))
        },
        onClose() {
          console.log(`[Room: ${roomId}] Disconnected`)
        }
      }
    })
  )

// フロントエンド（Next.js）へ共有する唯一の型定義
export type AppType = typeof routes
export default app
```

---

## 6. フロントエンド（Next.js）での RPC 利用イメージ

この設計図通りに構築すると、フロントエンド側では `client` オブジェクトから完全な階層補完とURLパラメータの型チェックが効くようになります。

```typescript
import { client } from '@/lib/api' // hc<AppType>(BASE_URL) で初期化したインスタンス

async function demo() {
  // 1. HTTP API で過去ログを安全にGET
  const res = await client.api.v1.rooms[':roomId'].messages.$get({
    param: { roomId: 'room_abc' },
    query: { limit: '20' }
  })
  if (res.ok) {
    const { messages } = await res.json()
  }

  // 2. WebSocketのURLもパスパラメータ付きで完全自動補完生成
  const rawUrl = client.ws.rooms[':roomId'].$url({
    param: { roomId: 'room_abc' }
  })
  const wsUrl = rawUrl.toString().replace(/^http/, 'ws')
  const socket = new WebSocket(wsUrl)
}
```
