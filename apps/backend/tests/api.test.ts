import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/index';
import { createMockD1, createMockRoomSession } from './setup';

describe('Irori Backend API Tests', () => {
  let mockD1: D1Database;
  let mockRoomSession: any;
  let env: any;

  beforeEach(() => {
    mockD1 = createMockD1();
    mockRoomSession = createMockRoomSession();
    env = {
      irori_db: mockD1,
      ROOM_SESSION: mockRoomSession,
    };
  });

  // 1. Auth & Users Tests
  it('should automatically create a guest user if no auth header is provided', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/users/me'),
      env
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.id).toMatch(/^guest_/);
    expect(data.name).toMatch(/^Guest_/);
    expect(data.statusLamp).toBe('free');
  });

  it('should use custom userId if Bearer token is provided', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/users/me', {
        headers: { Authorization: 'Bearer my-user-123' },
      }),
      env
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.id).toBe('my-user-123');
    expect(data.name).toBe('Guest_-123'); // Guest_ + last 4 characters
  });

  it('should update user statusLamp', async () => {
    const headers = { Authorization: 'Bearer test-user' };
    const patchRes = await app.fetch(
      new Request('http://localhost/api/v1/users/status', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ statusLamp: 'away' }),
      }),
      env
    );
    expect(patchRes.status).toBe(200);

    const meRes = await app.fetch(
      new Request('http://localhost/api/v1/users/me', { headers }),
      env
    );
    const data = (await meRes.json()) as any;
    expect(data.statusLamp).toBe('away');
  });

  // 2. Friends Connection Tests
  it('should create invite code and connect friends', async () => {
    const userAHeaders = { Authorization: 'Bearer user-a' };
    const userBHeaders = { Authorization: 'Bearer user-b' };

    // Bのフレンド一覧 (初期状態は空)
    const listRes1 = await app.fetch(
      new Request('http://localhost/api/v1/friends', {
        headers: userBHeaders,
      }),
      env
    );
    expect(((await listRes1.json()) as any).friends).toHaveLength(0);

    // Aが招待コードを作成
    const inviteRes = await app.fetch(
      new Request('http://localhost/api/v1/friends/invite-code', {
        method: 'POST',
        headers: userAHeaders,
      }),
      env
    );
    const { inviteCode } = (await inviteRes.json()) as any;

    // BがAの招待コードを使って接続
    const connectRes = await app.fetch(
      new Request('http://localhost/api/v1/friends/connect', {
        method: 'POST',
        headers: userBHeaders,
        body: JSON.stringify({ inviteCode }),
      }),
      env
    );
    expect(connectRes.status).toBe(200);

    // Bのフレンド一覧にAがいるか確認
    const listRes2 = await app.fetch(
      new Request('http://localhost/api/v1/friends', {
        headers: userBHeaders,
      }),
      env
    );
    const friends = ((await listRes2.json()) as any).friends;
    expect(friends).toHaveLength(1);
    expect(friends[0].id).toBe('user-a');
  });

  // 3. Rooms & Settings Tests
  it('should create room, join room, and modify settings', async () => {
    const userA = { Authorization: 'Bearer user-a' };
    const userB = { Authorization: 'Bearer user-b' };

    // ルーム作成
    const createRes = await app.fetch(
      new Request('http://localhost/api/v1/rooms', {
        method: 'POST',
        headers: userA,
        body: JSON.stringify({ name: '焚き火囲炉裏', isEphemeral: false }),
      }),
      env
    );
    expect(createRes.status).toBe(201);
    const room = (await createRes.json()) as any;
    expect(room.name).toBe('焚き火囲炉裏');

    // メンバーBはまだルームに入っていないため、取得制限 (403)
    const getResB1 = await app.fetch(
      new Request(`http://localhost/api/v1/rooms/${room.id}`, {
        headers: userB,
      }),
      env
    );
    expect(getResB1.status).toBe(403);

    // AがBを招待するためのトークンを生成
    const inviteRes = await app.fetch(
      new Request(`http://localhost/api/v1/rooms/${room.id}/invite`, {
        method: 'POST',
        headers: userA,
      }),
      env
    );
    const { token } = (await inviteRes.json()) as any;

    // Bが招待トークンを用いて参加
    const joinRes = await app.fetch(
      new Request('http://localhost/api/v1/rooms/join', {
        method: 'POST',
        headers: userB,
        body: JSON.stringify({ token }),
      }),
      env
    );
    expect(joinRes.status).toBe(200);

    // 参加したのでBが詳細を取得できる
    const getResB2 = await app.fetch(
      new Request(`http://localhost/api/v1/rooms/${room.id}`, {
        headers: userB,
      }),
      env
    );
    expect(getResB2.status).toBe(200);
    const roomDetail = (await getResB2.json()) as any;
    expect(roomDetail.settings.isReadVisible).toBe(true);

    // A (管理者) が設定を変更
    const patchRes = await app.fetch(
      new Request(`http://localhost/api/v1/rooms/${room.id}/settings`, {
        method: 'PATCH',
        headers: userA,
        body: JSON.stringify({ isReadVisible: false }),
      }),
      env
    );
    expect(patchRes.status).toBe(200);

    // 反映されているか確認
    const getResA = await app.fetch(
      new Request(`http://localhost/api/v1/rooms/${room.id}`, {
        headers: userA,
      }),
      env
    );
    const roomDetailA = (await getResA.json()) as any;
    expect(roomDetailA.settings.isReadVisible).toBe(false);

    // B (一般メンバー) は設定変更できない (403)
    const patchResB = await app.fetch(
      new Request(`http://localhost/api/v1/rooms/${room.id}/settings`, {
        method: 'PATCH',
        headers: userB,
        body: JSON.stringify({ isReadVisible: true }),
      }),
      env
    );
    expect(patchResB.status).toBe(403);
  });

  // 4. Messages (Normal/Ephemeral) & Webhooks Tests
  it('should post messages in normal and ephemeral rooms and trigger broadcast', async () => {
    const userA = { Authorization: 'Bearer user-a' };

    // 通常ルーム作成
    const r1Res = await app.fetch(
      new Request('http://localhost/api/v1/rooms', {
        method: 'POST',
        headers: userA,
        body: JSON.stringify({ name: '通常', isEphemeral: false }),
      }),
      env
    );
    const r1 = (await r1Res.json()) as any;

    // 一時ルーム作成
    const r2Res = await app.fetch(
      new Request('http://localhost/api/v1/rooms', {
        method: 'POST',
        headers: userA,
        body: JSON.stringify({ name: '一時', isEphemeral: true }),
      }),
      env
    );
    const r2 = (await r2Res.json()) as any;

    // 通常ルームにメッセージ投稿
    mockRoomSession.clearBroadcasts();
    const msg1Res = await app.fetch(
      new Request(`http://localhost/api/v1/rooms/${r1.id}/messages`, {
        method: 'POST',
        headers: userA,
        body: JSON.stringify({ content: 'ハロー通常' }),
      }),
      env
    );
    expect(msg1Res.status).toBe(201);
    const { id: m1Id } = (await msg1Res.json()) as any;

    // DOへのブロードキャスト履歴確認
    const broadcasts = mockRoomSession.getBroadcasts();
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0].roomId).toBe(r1.id);
    expect(broadcasts[0].payload.type).toBe('NEW_MESSAGE');
    expect(broadcasts[0].payload.data.content).toBe('ハロー通常');

    // 一時ルームにメッセージ投稿
    const msg2Res = await app.fetch(
      new Request(`http://localhost/api/v1/rooms/${r2.id}/messages`, {
        method: 'POST',
        headers: userA,
        body: JSON.stringify({ content: 'ハロー一時' }),
      }),
      env
    );
    expect(msg2Res.status).toBe(201);

    // 通常ルームのメッセージ取得
    const list1Res = await app.fetch(
      new Request(`http://localhost/api/v1/rooms/${r1.id}/messages`, {
        headers: userA,
      }),
      env
    );
    const { messages: m1List } = (await list1Res.json()) as any;
    expect(m1List).toHaveLength(1);
    expect(m1List[0].content).toBe('ハロー通常');

    // メッセージの編集
    const editRes = await app.fetch(
      new Request(`http://localhost/api/v1/messages/${m1Id}`, {
        method: 'PUT',
        headers: userA,
        body: JSON.stringify({ content: 'ハロー通常(編集済)' }),
      }),
      env
    );
    expect(editRes.status).toBe(200);

    // メッセージの削除
    const deleteRes = await app.fetch(
      new Request(`http://localhost/api/v1/messages/${m1Id}`, {
        method: 'DELETE',
        headers: userA,
      }),
      env
    );
    expect(deleteRes.status).toBe(200);

    // 削除されたので取得結果は空
    const list1Res2 = await app.fetch(
      new Request(`http://localhost/api/v1/rooms/${r1.id}/messages`, {
        headers: userA,
      }),
      env
    );
    expect(((await list1Res2.json()) as any).messages).toHaveLength(0);

    // Webhook による投稿 (tokenはroomIdのbase64)
    const token = btoa(r1.id);
    const webhookRes = await app.fetch(
      new Request(`http://localhost/api/v1/webhooks/${token}`, {
        method: 'POST',
        body: JSON.stringify({ content: 'Webhookからの通知' }),
      }),
      env
    );
    expect(webhookRes.status).toBe(200);

    // Webhook投稿確認
    const listWebhookMsg = await app.fetch(
      new Request(`http://localhost/api/v1/rooms/${r1.id}/messages`, {
        headers: userA,
      }),
      env
    );
    const { messages: webmsgs } = (await listWebhookMsg.json()) as any;
    expect(webmsgs).toHaveLength(1);
    expect(webmsgs[0].content).toBe('Webhookからの通知');
    expect(webmsgs[0].userId).toBeNull(); // Bot 投稿なので userId は null
  });
});
