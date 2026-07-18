'use client';

import {
  Bell,
  Copy,
  Flame,
  Plus,
  RefreshCw,
  UserPlus,
  Users,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useAppContext } from '@/hooks/useAppContext';
import { client } from '@/lib/api';
import { CreateRoomDialog } from './create-room-dialog';

export function SidebarContainer() {
  const {
    rooms,
    friends,
    activeRoomId,
    setActiveRoomId,
    token,
    refreshFriends,
    refreshRooms,
  } = useAppContext();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [friendCode, setFriendCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectSuccess, setConnectSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  const getHeaders = () =>
    token ? { Authorization: `Bearer ${token}` } : undefined;

  // フレンド招待コードの生成
  const handleGenerateCode = async () => {
    try {
      const res = await client.api.v1.friends['invite-code'].$post(
        {},
        { headers: getHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        setGeneratedCode(data.inviteCode);
        setCopied(false);
      }
    } catch (err) {
      console.error('Failed to generate invite code:', err);
    }
  };

  // フレンド招待コードのコピー
  const handleCopyCode = () => {
    if (!generatedCode) return;
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 招待コードを用いたフレンド接続
  const handleConnectFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendCode.trim()) return;

    try {
      setConnectError(null);
      setConnectSuccess(false);
      const res = await client.api.v1.friends.connect.$post(
        { json: { inviteCode: friendCode.trim() } },
        { headers: getHeaders() }
      );
      if (res.ok) {
        setConnectSuccess(true);
        setFriendCode('');
        await refreshFriends();
      } else {
        const errData = (await res.json()) as { error?: string };
        setConnectError(errData.error || '接続に失敗しました');
      }
    } catch (_err) {
      setConnectError('通信エラーが発生しました');
    }
  };

  // ステータスランプの色
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'free':
        return 'bg-[#4CAF50]';
      case 'busy':
        return 'bg-[#FF3B30]';
      case 'away':
        return 'bg-[#FFCC00]';
      default:
        return 'bg-[#8E8E93]';
    }
  };

  return (
    <div className="w-[280px] h-full bg-[#131316] border-r border-[#1F1F23] flex flex-col justify-between select-none">
      {/* 上部: ルーム一覧 */}
      <div className="flex flex-col flex-1 overflow-y-auto px-4 py-4 gap-4">
        {/* ヘッダー */}
        <div className="flex items-center justify-between text-[#F5F5F7]">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-[#FF5722]" />
            <span className="font-bold text-lg font-sans">Irori</span>
          </div>
          <button
            type="button"
            className="p-1 rounded hover:bg-[#1F1F23] transition-colors relative border-0 text-[#8E8E93] hover:text-[#F5F5F7] cursor-pointer"
            aria-label="通知一覧"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-[#FF5722]" />
          </button>
        </div>

        {/* サブヘッダー */}
        <div className="text-xs text-[#8E8E93] font-semibold tracking-wider px-1">
          囲炉裏 完全招待制
        </div>

        {/* ルームリスト */}
        <div className="flex flex-col gap-2">
          {rooms.map((room) => {
            const isActive = room.id === activeRoomId;
            return (
              <button
                key={room.id}
                type="button"
                onClick={() => setActiveRoomId(room.id)}
                className={`w-full text-left p-3 rounded-md flex items-center justify-between transition-colors border-0 cursor-pointer ${
                  isActive
                    ? 'bg-[#18181C] text-[#F5F5F7] border border-[#1F1F23]'
                    : 'text-[#8E8E93] hover:bg-[#18181C]/50 hover:text-[#F5F5F7]'
                }`}
              >
                <div className="flex flex-col gap-1 w-full overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold truncate">
                      {room.name}
                    </span>
                    {room.isEphemeral && (
                      <span className="text-[10px] bg-[#FF5722]/10 text-[#FF5722] px-1.5 py-0.5 rounded font-semibold whitespace-nowrap">
                        一時
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-[#8E8E93]">完全招待制</span>
                </div>
              </button>
            );
          })}

          {rooms.length === 0 && (
            <div className="text-center py-6 text-sm text-[#8E8E93]">
              参加中の囲炉裏がありません
            </div>
          )}
        </div>

        {/* 新規ルーム作成ボタン */}
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="w-full h-11 border border-dashed border-[#FF5722] hover:bg-[#FF5722]/5 text-[#FF5722] font-semibold rounded-md flex items-center justify-center gap-2 transition-colors text-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          新しいルームを作成 (招待)
        </button>
      </div>

      {/* 下部: つながり (フレンド) 管理 */}
      <div className="border-t border-[#1F1F23] bg-[#0A0A0C]/40 p-4 flex flex-col gap-4">
        {/* フレンド見出し */}
        <div className="flex items-center justify-between text-xs text-[#8E8E93] font-semibold tracking-wider">
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            <span>つながり ({friends.length})</span>
          </div>
          <button
            type="button"
            onClick={async () => {
              await refreshFriends();
              await refreshRooms();
            }}
            className="p-1 text-[#8E8E93] hover:text-[#F5F5F7] transition-colors border-0 cursor-pointer"
            aria-label="情報を更新"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* フレンドアバターリスト */}
        <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
          {friends.map((friend) => (
            <div
              key={friend.id}
              className="relative w-8 h-8 rounded-full bg-[#131316] border border-[#1F1F23] flex items-center justify-center text-xs font-bold text-[#F5F5F7]"
              title={friend.name}
            >
              {friend.name.slice(0, 2).toUpperCase()}
              {/* ステータスランプ */}
              <div
                className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ${getStatusColor(
                  friend.statusLamp
                )} border border-[#0A0A0C]`}
              />
            </div>
          ))}

          {friends.length === 0 && (
            <div className="text-[11px] text-[#8E8E93] py-2 w-full text-center">
              つながっているフレンドがいません
            </div>
          )}
        </div>

        {/* つながり追加 (招待コード接続) フォーム */}
        <div className="flex flex-col gap-2 border-t border-[#1F1F23]/60 pt-3">
          <form onSubmit={handleConnectFriend} className="flex gap-2">
            <input
              type="text"
              value={friendCode}
              onChange={(e) => setFriendCode(e.target.value)}
              placeholder="招待コードを入力"
              className="flex-1 h-9 rounded bg-[#131316] border border-[#1F1F23] text-xs text-[#F5F5F7] px-2.5 placeholder-[#8E8E93]/60 focus:outline-none focus:border-[#FF5722] text-base"
              style={{ fontSize: '16px' }} // iOSキーボードズームバグ防止の強制16px
            />
            <button
              type="submit"
              className="h-9 w-9 bg-[#1F1F23] hover:bg-[#FF5722] hover:text-white text-[#8E8E93] rounded flex items-center justify-center transition-colors border-0 cursor-pointer"
              aria-label="フレンドを追加"
            >
              <UserPlus className="w-4 h-4" />
            </button>
          </form>

          {/* エラー・成功時のフィードバック */}
          {connectError && (
            <p className="text-[10px] text-red-500 bg-red-950/20 px-2 py-1 rounded border border-red-900/30">
              {connectError}
            </p>
          )}
          {connectSuccess && (
            <p className="text-[10px] text-[#4CAF50] bg-green-950/20 px-2 py-1 rounded border border-green-900/30">
              つながりを確立しました
            </p>
          )}

          {/* 自分の招待コード生成 */}
          <button
            type="button"
            onClick={handleGenerateCode}
            className="w-full h-8 text-[11px] font-semibold bg-[#131316] text-[#8E8E93] hover:text-[#F5F5F7] border border-[#1F1F23] hover:bg-[#18181C] rounded transition-colors cursor-pointer"
          >
            自身の招待コードを発行
          </button>

          {generatedCode && (
            <div className="flex items-center gap-1.5 bg-[#18181C] border border-[#1F1F23] px-2 py-1 rounded">
              <input
                type="text"
                readOnly
                value={generatedCode}
                className="flex-1 bg-transparent border-0 text-[10px] text-[#8E8E93] select-all focus:outline-none font-mono"
              />
              <button
                type="button"
                onClick={handleCopyCode}
                className="p-1 hover:text-[#FF5722] text-[#8E8E93] transition-colors border-0 cursor-pointer"
                title="コピー"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {copied && (
            <p className="text-[9px] text-[#4CAF50] text-center">
              コードをクリップボードにコピーしました
            </p>
          )}
        </div>
      </div>

      {/* 新規ルームダイアログモーダル */}
      {isCreateOpen && (
        <CreateRoomDialog onClose={() => setIsCreateOpen(false)} />
      )}
    </div>
  );
}
