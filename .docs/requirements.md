# プロダクト要件定義・概要設計書：Irori（イロリ）

## 1. プロダクト概要

### 1.1 コンセプト

「遠くの灯りを眺めるように、シーンに合わせて『ノリ』と『文脈』をチューニングして集まる、完全招待制の囲炉裏型ライフスタンス・チャット」

### 1.2 背景と目的

既存チャットの「常に繋がっている」「通知が多い」「履歴が残りすぎる」状態による心理的負荷を、ルームごとの距離感制御によって軽減する。アプリへのアカウント登録は任意としつつ、参加する各ルームは招待制にすることで、安心感のあるクローズドな交流空間を提供する。

---

## 2. システム要件（機能要件）

### 2.1 アカウント・フレンド機能

- Google ログイン（OAuth 認証）などで任意にアカウントが作成可能
- ただし、各ルームへの参加はルーム単位の招待リンク / QRコード / 1 対 1 招待で管理し、ルームごとにプライバシーとアクセス制御を担保する
- ステータス（気配）表示: 「ひま」「作業中」「離席」などの限定的なランプ

### 2.2 コミュニケーション機能（ルーム内）

- 視覚的に会話の塊を識別しやすいタイムライン
- 限定セットのリアクション
- メッセージ編集・削除
- 未読戻し
- 引用（リプライ）

### 2.3 メディア共有

- Google Picker API による画像選択
- Google Drive / Photos の共有 URL をチャットに埋め込む
- アプリ側では URL 文字列のみを保持し、バイナリ保存はしない

### 2.4 ルーム設定（トグル制御）

ルーム単位で管理者が以下を ON / OFF できる。

1. 既読の可視化
2. タイピング表示
3. スレッド
4. メンション
※「一時チャットモード（24時間消滅）」は、ルーム作成時のみ指定可能（不変属性）とする。

### 2.5 外部連携（Inbound API）

- 外部システムから認証トークンを用いて、特定ルームへメッセージを投稿する Webhook / REST API
- ただし初期フェーズでは、流し読み向けの bot 通知に限定する

---

## 3. 非機能要件

- 個人開発のコストを抑えるため、Cloudflare スタックとモノレポ構成を前提にする
- 法的・運用リスクを低減するため、メディアの実体は Google 側に寄せる
- Hono + Cloudflare Workers による低遅延 API、WebSocket によるリアルタイム通信を実現する
- D1 (SQLite) の頻繁な物理削除による断片化・パフォーマンス低下を防ぐため、一時チャットメッセージは専用テーブルに分離して運用する。
- フロントエンドは TanStack Query による厳密なサーバー状態キャッシュと、Zustand による軽量なUI・WebSocket状態管理を組み合わせ、高いUXと型安全なデータフェッチを保証する。

---

## 4. 画面・UI設計概要（ダッシュボード）

ダークテーマを基調とした 3 カラム構成とする。

- サイドバー（左）
  - ステータスランプ切り替え
  - 参加中ルーム一覧と未読バッジ
  - フレンド追加・招待導線
- メインチャットエリア（中央）
  - タイムライン表示
  - Google Drive / Photos の共有リンクプレビュー
  - メッセージ入力フォーム
- 設定パネル（右）
  - 既読・タイピング・スレッド・メンション・一時チャットのトグル

---

## 5. 概要設計（High-Level Design）

### 5.1 システムアーキテクチャ

モノレポ構成を採用する。

- フロントエンド: Next.js (App Router) + Tailwind CSS v4 + shadcn/ui + @base-ui/react
- バックエンド: Hono + Cloudflare Workers
- データベース: Cloudflare D1
- リアルタイム通信: WebSocket / Durable Objects (Cloudflare)
- 命名規約: API/フロントエンドは camelCase、DB は snake_case

### 5.2 API・リアルタイム通信アーキテクチャ

Hono の Type-safe RPC を前提に、HTTP API と WebSocket API を分離して設計する。

#### HTTP REST エンドポイント（/api/v1/*）

状態変更・データ取得・メッセージ投稿・編集・削除のトリガーに利用する。

#### WebSocket エンドポイント（/ws/rooms/:roomId）

ルーム内のリアルタイム通信に利用し、JSON 文字列を用いてイベントをやり取りする。

#### ブロードキャストイベント

- NEW_MESSAGE
- MESSAGE_EDIT
- MESSAGE_DELETE
- USER_TYPING

### 5.3 主要データモデル・永続化方針

- **User**: `id, name, google_oauth_id, status_lamp`
- **FriendConnection**: `user_id_a, user_id_b, created_at`
- **Room**: `id, name, is_ephemeral, created_at` (作成時に一時モードか否かを固定保持)
- **RoomMember**: `room_id, user_id, role, joined_at`
- **RoomSettings**: `room_id, is_read_visible, is_typing_visible, is_thread_enabled, is_mention_enabled` (is_ephemeral_mode を除外)
- **Message** (通常ルーム用): `id, room_id, user_id, content, media_url, reply_to_id, created_at, updated_at`
- **EphemeralMessage** (一時ルーム用): `id, room_id, user_id, content, media_url, reply_to_id, created_at` (インデックス再構築コストを下げるため完全分離)

#### 一時チャット（24 時間消滅）の実装方針

1. **物理削除の分離**: Cron / Triggers で `ephemeral_messages` テーブルのみに対して定期的に `DELETE` を実行する。これにより、蓄積されていくメインの `messages` テーブルがB-Treeインデックスの再構築や断片化による影響（パフォーマンス劣化）を受けるのを完全に防ぐ。
2. **画面上の消滅**: 念のため、Cron実行の隙間（ラグ）を考慮し、データ取得APIでも「24時間以内」の条件を `WHERE` 句に付与して安全に取得する。
