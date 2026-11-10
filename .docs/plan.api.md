# Irori（イロリ）v1 API ＆ リアルタイム通信設計書

## 1. 概要

本設計書は、Irori v1 の **React Router v7 + Cloudflare Durable Objects（SQLite内蔵）シングルパッケージ構成** における API およびリアルタイム通信の仕様書です。

従来の「外部 REST API ＋ 個別 WebSocket サーバー」の二重管理を廃止し、以下の 3 つの通信方式を統合して運用します。

1. **React Router v7 Loader / Action**:
   画面遷移、SSR、データ変更、および `clientLoader` / `clientAction` によるクライアントサイド透過暗号処理。
2. **Cloudflare Durable Objects WebSocket (Hibernatable)**:
   スペース内の超低遅延リアルタイム通信（チャット配信、リアクション、タイピング気配、空気感トグル即時反映）。
3. **Workers Native RPC**:
   エッジワーカー（React Router 実行環境）から `SpaceActor` / `UserActor` への型安全な内部プロシージャ呼び出し。

---

## 2. 通信アーキテクチャ ＆ ルーティング基本方針

```
┌────────────────────────────────────────────────────────────────────────┐
│ Client (Browser / PWA)                                                 │
│  ├── clientLoader  : 初期データ取得 ＆ IndexedDB 秘密鍵による一括自動復号     │
│  ├── clientAction  : 送信前暗号化 (formData から平文消去 ＆ 暗号文差し替え)     │
│  └── useWebSocket  : SpaceActor との常時接続 (イベント駆動型リアルタイム復号)    │
└────────────────────────────────────────────────────────────────────────┘
         │ (HTTP GET/POST)                               │ (Direct WebSocket)
         ▼                                               ▼
┌───────────────────────────────┐               ┌────────────────────────┐
│ React Router Loader / Action  │               │ SpaceActor (DO)        │
│ (Cloudflare Worker SSR)       │──Native RPC──▶│ ・内蔵 SQLite (Drizzle) │
│ ・Auth Guard & セッション検証    │               │ ・Hibernatable WS 配信  │
│ ・暗号文とボールトのみ中継       │               │ ・Alarm API (自動消滅)  │
└───────────────────────────────┘               └────────────────────────┘
```

- **E2EE の原則**:
  - サーバー（Worker / Durable Objects）には、メッセージ本文、スレッド、添付メディア、ワークフロー内容、プライベートメモの平文を一切渡さない（暗号文 `ciphertext` と `iv` のみ受信・保存）。
- **命名規則**:
  - TypeScript / JSON（通信ペイロード）: `camelCase`（例: `isReadVisible`, `keyEpoch`）
  - SQLite データベース: `snake_case`（例: `is_read_visible`, `key_epoch`）

---

## 3. React Router v7 ルートエンドポイント一覧

### 3.1 チャットメイン画面 (`app/routes/chat.$spaceId.$channelId.tsx`)

| 区分       | メソッド / 関数                   | 概要                                   | リクエスト                                                  | レスポンス / 内部処理                                                                                                                           |
| :--------- | :-------------------------------- | :------------------------------------- | :---------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Server** | `loader`                          | チャンネル初期データ ＆ 暗号化ログ取得 | パラメータ: `spaceId`, `channelId`<br>クエリ: `?cursor=...` | `{ spaceMeta, channel, encryptedMessages: MessageEntity[], wrappedSpaceKey }`                                                                   |
| **Client** | `clientLoader` (`hydrate = true`) | 透過的一括復号 ＆ 鍵ロストガード       | `serverLoader()` の結果                                     | IndexedDB の秘密鍵で復号した平文 `{ messages: DecryptedMessage[] }` を UI に提供。<br>※鍵が存在しない場合は `redirect('/restore-key')`          |
| **Client** | `clientAction`                    | 送信前暗号化 ＆ 平文消去               | `FormData` (`message`, `workflowPayload` 等)                | クライアント側で AES-GCM 暗号化し、`formData.delete('message')` 後に `formData.set('ciphertext', ...)` をセットして `serverAction()` を呼び出す |
| **Server** | `action`                          | 暗号文の永続化 ＆ 削除・編集           | `FormData` (`intent`, `ciphertext`, `iv`, `messageId`)      | `SpaceActor` の RPC を呼び出して内蔵 SQLite へ保存。WebSocket 経由で全クライアントへブロードキャスト                                            |

### 3.2 鍵復元・PIN入力画面 (`app/routes/restore-key.tsx`)

| 区分       | メソッド / 関数 | 概要                                                | リクエスト                 | レスポンス / 内部処理                                                                                                                                                                                                                                                                                                         |
| :--------- | :-------------- | :-------------------------------------------------- | :------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Server** | `loader`        | 鍵復元状態 ＆ PINソルト取得                         | 認証セッション Cookie      | `{ pinSalt, isLocked, remainingAttempts }`（UserActor より取得）                                                                                                                                                                                                                                                              |
| **Client** | `clientAction`  | 6桁PIN認証トークン導出 ＆ 秘密鍵アンラップ          | `FormData` (`pin`)         | 1. 6桁PIN ＋ `pinSalt` から認証用ハッシュ (`pinAuthHash`) を導出し `serverAction()` へ送信<br>2. サーバーから返却された `encryptedBackupUserKey` と `serverPepperToken` を用い、最終 KEK を導出<br>3. `crypto.subtle.unwrapKey` で `extractable: false` な秘密鍵を IndexedDB に直接保存（オフライン総当たりを暗号学的に遮断） |
| **Server** | `action`        | PIN 検証・ロックアウト管理・Pepper 結合ボールト返却 | `FormData` (`pinAuthHash`) | `UserActor` で試行回数ロックアウト（連続5回失敗で一時凍結）を検証。一致時のみ Cloudflare Workers 環境シークレット (`Pepper`) 由来の `serverPepperToken` と `encryptedBackupUserKey` を返却                                                                                                                                    |

### 3.3 スペース管理・設定画面 (`app/routes/settings.tsx`)

| 区分       | メソッド / 関数 | 概要                                               | リクエスト                                     | レスポンス / 内部処理                                                                                     |
| :--------- | :-------------- | :------------------------------------------------- | :--------------------------------------------- | :-------------------------------------------------------------------------------------------------------- |
| **Server** | `loader`        | スペース設定・参加メンバー・カスタム絵文字一覧取得 | パラメータ: `spaceId`                          | `{ spaceMeta, members, customEmojis, myProfile }`                                                         |
| **Server** | `action`        | 空気感トグル変更、定員変更、カスタム絵文字登録     | `FormData` (`intent`, `settings`, `emojiFile`) | 画像は Cloudflare R2 に保管し、メタデータを `SpaceActor` 内蔵 SQLite へ保存。WebSocket で全メンバーに反映 |

### 3.4 リソースルート ＆ OpenAPI 連携 (`app/routes/api.*.ts`)

React Router v7 の UI ルート（`loader` / `action`）に加え、外部システム連携や programmatic な呼び出し向けに以下の Resource Routes（`openapi.yaml` 準拠）を提供します。

- **`/api/users/profile` (`GET` / `PATCH`)**: ユーザーの基本プロフィール・公開鍵・ステータスランプ（🟢/🔴/🟡）取得・更新。
- **`/api/users/backup-vault` (`POST`) / `/api/users/verify-pin` (`POST`)**: 6桁バックアップ PIN による暗号化ボールト登録、およびロックアウト・Pepper 保護付きボールト復元。
- **`/api/spaces/:spaceId/emojis` (`GET` / `POST`)**: スペース単位のカスタム絵文字一覧取得 ＆ Cloudflare R2 マルチパートアップロード。
- **`/api/webhooks/:token` (`POST`)**: 外部システムからの Inbound Webhook（事前共有されたチャンネル用公開鍵 / Webhook 鍵で E2EE 暗号化されたペイロード `ciphertext`, `iv` を受信し、対象チャンネルへ配信）。

---

## 4. WebSocket イベント仕様 (`/ws/spaces/:spaceId`)

すべての WebSocket メッセージは `type` プロパティを含む JSON 形式で通信します。

### 4.1 接続確立フロー (Handshake)

1. クライアントが `GET /ws/spaces/:spaceId` へ WebSocket Upgrade リクエストを送信（セッション Cookie 同伴）。
2. Worker の認可ガード（`requireSpaceMember`）で検証後、`SpaceActor.fetch()` に転送して WebSocket Hibernation 接続を確立。
3. 接続時、`SpaceActor` はクライアントの WebSocket オブジェクトにメンバー情報（`memberId`, `role`）を添付（`ws.serializeAttachment`）。

### 4.2 クライアント ➡️ サーバー（ユーザーアクション）

激しい状態変化やリアルタイムイベント。インメモリで処理され、即座に他メンバーへブロードキャストされます。

- **タイピング開始 / 停止**:

  ```json
  { "type": "TYPING_UPDATE", "channelId": "ch_123", "isTyping": true }
  ```
- **在室気配ピン (Presence Ping)**:

  ```json
  { "type": "PRESENCE_PING", "channelId": "ch_123" }
  ```
- **リアルタイム暗号化メッセージ送信 (低遅延ショートカット)**:

  ```json
  {
    "type": "SEND_MESSAGE",
    "channelId": "ch_123",
    "parentMessageId": null,
    "ciphertext": "Base64...",
    "iv": "Base64...",
    "keyEpoch": 1,
    "workflowType": null
  }
  ```
- **絵文字・スタンプリアクション**:

  ```json
  { "type": "TOGGLE_REACTION", "messageId": "msg_999", "emojiCode": "🍵" }
  ```

### 4.3 サーバー ➡️ クライアント（ブロードキャスト配信）

- **新着暗号化メッセージ (`NEW_MESSAGE`)**:

  ```json
  {
    "type": "NEW_MESSAGE",
    "data": {
      "id": "msg_999",
      "channelId": "ch_123",
      "parentMessageId": null,
      "senderMemberId": "mem_456",
      "ciphertext": "Base64...",
      "iv": "Base64...",
      "keyEpoch": 1,
      "workflowType": null,
      "createdAt": "2026-11-09T02:00:00.000Z"
    }
  }
  ```
- **メッセージ編集 (`MESSAGE_EDIT`)**:

  ```json
  {
    "type": "MESSAGE_EDIT",
    "data": {
      "id": "msg_999",
      "channelId": "ch_123",
      "ciphertext": "Base64...",
      "iv": "Base64...",
      "updatedAt": "2026-11-09T02:05:00.000Z"
    }
  }
  ```
- **メッセージ完全削除 (`MESSAGE_DELETE`)**:

  ```json
  {
    "type": "MESSAGE_DELETE",
    "data": { "id": "msg_999", "channelId": "ch_123" }
  }
  ```
- **リアクション更新 (`REACTION_UPDATE`)**:

  ```json
  {
    "type": "REACTION_UPDATE",
    "data": {
      "messageId": "msg_999",
      "reactions": [{ "emojiCode": "🍵", "count": 3, "me": true }]
    }
  }
  ```
- **在室気配 ＆ 会話熱量状態 (`PRESENCE_STATE`)**:

  ```json
  {
    "type": "PRESENCE_STATE",
    "data": {
      "channelId": "ch_123",
      "activeMembers": [
        { "memberId": "mem_456", "name": "サユリ", "statusLamp": "free" }
      ],
      "heatLevel": 0.75
    }
  }
  ```
- **チャンネル空気感トグル即時反映 (`SETTING_TOGGLE`)**:

  ```json
  {
    "type": "SETTING_TOGGLE",
    "data": {
      "channelId": "ch_123",
      "settings": {
        "isReadVisible": false,
        "isTypingVisible": true,
        "isThreadEnabled": true,
        "isMentionEnabled": false,
        "isAnonymousMode": false,
        "isEphemeral": false
      }
    }
  }
  ```

---

## 5. Workers Native RPC インターフェース設計

React Router の Server Loader / Action から Durable Objects を直接操作するための内部 RPC 定義。

```typescript
// workers/actors/space.actor.ts
export interface SpaceActorRPC {
  // メッセージ操作
  postMessage(data: InsertMessageDTO): Promise<{ id: string }>;
  editMessage(
    messageId: string,
    ciphertext: string,
    iv: string,
  ): Promise<boolean>;
  deleteMessage(messageId: string): Promise<boolean>;
  getRecentMessages(
    channelId: string,
    limit: number,
    cursor?: string,
  ): Promise<MessageEntity[]>;

  // 空気感・設定変更
  updateChannelSettings(
    channelId: string,
    settings: Partial<ChannelSettings>,
  ): Promise<boolean>;
  addCustomEmoji(emoji: InsertCustomEmojiDTO): Promise<{ id: string }>;

  // メンバー・鍵管理
  joinMember(
    userId: string,
    role: string,
    wrappedKey: string,
  ): Promise<boolean>;
  rotateSpaceKey(
    newKeyEpoch: number,
    rewrappedKeys: Record<string, string>,
  ): Promise<boolean>;
}

// workers/actors/user.actor.ts
export interface UserActorRPC {
  // 6桁PIN & ロックアウト・Pepper 保護管理
  getPinChallenge(): Promise<{
    pinSalt: string;
    isLocked: boolean;
    remainingAttempts: number;
  }>;
  setBackupVault(
    encryptedKey: string,
    salt: string,
    pinAuthHash: string,
  ): Promise<boolean>;
  unlockBackupVault(pinAuthHash: string): Promise<{
    isLocked: boolean;
    remainingAttempts: number;
    encryptedBackupUserKey?: string;
    serverPepperToken?: string;
  }>;

  // プライベートメモ & ブックマーク (二重隔離)
  addBookmark(data: InsertBookmarkDTO): Promise<{ id: string }>;
  getBookmarks(): Promise<BookmarkEntity[]>;
  deleteBookmark(bookmarkId: string): Promise<boolean>;
}
```
