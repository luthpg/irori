# Irori バックエンド 今後の課題・未実装タスク (本番移行用)

本ドキュメントは、Irori のバックエンドにおいて今後本番環境へのデプロイや本格的な運用のために実装が必要となるタスクの一覧です。

## 1. Google OAuth 認証の統合

- [ ] **ミドルウェアの差し替え**
  - 現在 `auth.ts` に実装されている簡易認証（ヘッダーの `Bearer <userId>` や Cookie を直接受け取る実装）を、正規の Google OAuth ID トークン検証ロジックに差し替える。
- [ ] **ユーザー情報のマッピング**
  - Google ログイン成功時に返されるプロファイル情報を D1 データベースの `users` テーブル（`google_oauth_id`, `name`）にマッピング・保存する処理を追加。

## 2. WebSocket 切断時のタイピング状態クリーンアップ

- [ ] **切断時の残留タイピング状態対策**
  - ユーザーがタイピング中（`TYPING_START` 送信後）に `TYPING_STOP` を送ることなく切断した場合、他クライアント上でタイピング中の表示が残り続けてしまう問題の解消。
- [ ] **ユーザーIDとソケットの紐付け**
  - WS接続確立時に、クエリパラメータ等から `userId` を受け取り、Durable Object の `serializeAttachment` などを用いて WebSocket 接続に `userId` を紐付け保存する。
- [ ] **切断イベントでのブロードキャスト**
  - `webSocketClose` ハンドラ内で、切断したユーザーの `USER_TYPING`（`isTyping: false`）イベントを他のクライアントに向けて自動でブロードキャストする処理を実装。

## 3. Google Photos プレビューの強化

- [ ] **Photos 共有 URL のスクレイピング/メタデータ取得**
  - `media/preview` API は現在 Google Drive 以外の URL（Google Photos を含む）については簡易的なフォールバック URL 返却のみ。
  - Google Photos の短縮 URL や共有リンクを受け取った際、リダイレクト先 (OGP 情報) をサーバーサイドで取得・パースして、プレビュー用のタイトルやサムネイル画像 URL を安全に抽出するロジックの実装。

## 4. 古い招待レコードの定期クリーンアップ

- [ ] **無効な招待データの削除クエリ追加**
  - `scheduled` (Cron) ハンドラ内にて、24 時間経過後の一時チャットメッセージ削除に加え、有効期限が切れた `friend_invitations` および `room_invitations` レコードを DB から自動で物理削除 (`DELETE`) するクエリの追加。

## 5. 本番環境 (Cloudflare) へのデプロイと動作検証

- [ ] **Durable Objects の動作確認**
  - Cloudflare の Workers Paid プラン環境で、Durable Objects (`RoomSession`) が意図通りにスケールし、エラーなく動作することの検証。
- [ ] **Cron トリガーの本番動作確認**
  - `scheduled` イベントが Cloudflare Workers の Cron トリガー（1時間毎の実行等）によって本番環境で実行されていることの検証。
