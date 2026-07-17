import { DurableObject } from 'cloudflare:workers';

export class RoomSession extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // 内部 REST 通信によるブロードキャスト要求
    if (url.pathname === '/broadcast') {
      const payload = await request.json();
      this.broadcast(payload);
      return new Response('ok', { status: 200 });
    }

    // WebSocket 接続要求のハンドリング
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Hibernation API を使用して WebSocket 接続をホスト
    this.ctx.acceptWebSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  // クライアントからメッセージ（タイピングなど）を受信したときの処理
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    try {
      if (typeof message !== 'string') return;
      const event = JSON.parse(message);

      if (event.type === 'TYPING_START' || event.type === 'TYPING_STOP') {
        const userId = event.userId;
        const isTyping = event.type === 'TYPING_START';

        // 接続している他ユーザーにタイピング状態の変更を配信
        this.broadcast(
          {
            type: 'USER_TYPING',
            data: {
              userId,
              isTyping,
            },
          },
          ws
        ); // 送信元クライアントは除外
      }
    } catch (err) {
      console.error('Error processing WebSocket message in RoomSession:', err);
    }
  }

  // ブロードキャスト用ヘルパー
  private broadcast(payload: unknown, excludeWs?: WebSocket) {
    const websockets = this.ctx.getWebSockets();
    const messageStr = JSON.stringify(payload);

    for (const ws of websockets) {
      if (excludeWs && ws === excludeWs) continue;
      try {
        ws.send(messageStr);
      } catch {
        // エラー時は WebSocket を安全に閉じる
        ws.close(1011, 'Send failed');
      }
    }
  }
}
