import { Hono } from 'hono';
import { upgradeWebSocket } from 'hono/cloudflare-workers';
import { cors } from 'hono/cors';

const app = new Hono();

app.use(
  '*',
  cors({
    origin: (origin) => origin,
    credentials: true,
  })
);

const routes = app
  .get('/api/v1', (c) => c.text('ok', 200))

  // ==========================================
  // 1. HTTP エンドポイント (REST API)
  // ==========================================
  .get('/api/v1/users/me', (c) =>
    c.json({ id: 'u1', name: 'luthpg', statusLamp: 'free' })
  )
  .patch('/api/v1/users/status', (c) => c.json({ success: true }))
  .get('/api/v1/friends', (c) => c.json({ friends: [] }))

  .get('/api/v1/rooms', (c) => c.json({ rooms: [] }))
  .post('/api/v1/rooms', (c) => c.json({ id: 'r1', name: '雑談囲炉裏' }, 201))
  .get('/api/v1/rooms/:roomId', (c) =>
    c.json({ id: c.req.param('roomId'), settings: {} })
  )
  .patch('/api/v1/rooms/:roomId/settings', (c) => c.json({ success: true }))

  .get('/api/v1/rooms/:roomId/messages', (c) =>
    c.json({ messages: [], nextCursor: null })
  )
  .post('/api/v1/rooms/:roomId/messages', (c) =>
    c.json({ id: 'm1', status: 'saved' }, 201)
  )
  .put('/api/v1/messages/:messageId', (c) => c.json({ success: true }))
  .delete('/api/v1/messages/:messageId', (c) => c.json({ success: true }))

  .post('/api/v1/webhooks/:webhookToken', (c) => c.json({ success: true }))

  // ==========================================
  // 2. WebSocket エンドポイント (ルーム別の土管)
  // ==========================================
  // 💡 URLパラメータ（:roomId）を仕込んでおくことで、部屋ごとの接続を管理できます
  .get(
    '/ws/rooms/:roomId',
    upgradeWebSocket((c) => {
      const roomId = c.req.param('roomId');

      return {
        onMessage(event, ws) {
          // TODO: ここでDurable Objectsに接続してブロードキャスト
          ws.send(JSON.stringify({ type: 'ECHO', data: event.data }));
        },
        onClose() {
          // console.log(`[Room: ${roomId}] 接続が切断されました`);
        },
        onError(err) {
          // console.error(`[Room: ${roomId}] WebSocketエラー:`, err);
        },
      };
    })
  );

export type AppType = typeof routes;

export default app;
