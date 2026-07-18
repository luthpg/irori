'use client';

import { Copy, Flame, RefreshCw, Shield, User, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppContext } from '@/hooks/useAppContext';
import { client } from '@/lib/api';

interface SettingsPanelProps {
  roomId: string;
  onClose?: () => void; // モバイルドロワー用の閉じるトリガー
}

interface RoomDetailData {
  id: string;
  name: string;
  isEphemeral: boolean;
  settings: {
    isReadVisible: boolean;
    isTypingVisible: boolean;
    isThreadEnabled: boolean;
    isMentionEnabled: boolean;
  };
  members: Array<{
    userId: string;
    role: 'admin' | 'member';
    name: string;
    statusLamp: 'free' | 'busy' | 'away';
  }>;
}

export function SettingsPanel({ roomId, onClose }: SettingsPanelProps) {
  const { token, user } = useAppContext();
  const [roomDetail, setRoomDetail] = useState<RoomDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [updating, setUpdating] = useState(false);

  const getHeaders = () =>
    token ? { Authorization: `Bearer ${token}` } : undefined;

  const fetchRoomDetail = async () => {
    try {
      setLoading(true);
      const res = await client.api.v1.rooms[':roomId'].$get(
        { param: { roomId } },
        { headers: getHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        setRoomDetail(data as RoomDetailData);
      }
    } catch (err) {
      console.error('Failed to fetch room details:', err);
    } finally {
      setLoading(false);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetchRoomDetail changes reference on every render. Trigger only on roomId and token.
  useEffect(() => {
    fetchRoomDetail();
  }, [roomId, token]);

  if (loading) {
    return (
      <div className="w-[320px] h-full bg-[#131316] border-l border-[#1F1F23] flex flex-col items-center justify-center text-sm text-[#8E8E93] select-none gap-2 shrink-0">
        <RefreshCw className="w-5 h-5 animate-spin text-[#FF5722]" />
        <span>読み込み中...</span>
      </div>
    );
  }

  if (!roomDetail || !user) return null;

  // 自分が管理者かどうかを判定
  const myMember = roomDetail.members.find((m) => m.userId === user.id);
  const isAdmin = myMember?.role === 'admin';

  // トグル変更ハンドラ
  const handleToggleSetting = async (key: keyof RoomDetailData['settings']) => {
    if (!isAdmin || updating) return;

    const updatedSettings = {
      ...roomDetail.settings,
      [key]: !roomDetail.settings[key],
    };

    try {
      setUpdating(true);
      const res = await client.api.v1.rooms[':roomId'].settings.$patch(
        {
          param: { roomId },
          json: updatedSettings,
        },
        { headers: getHeaders() }
      );
      if (res.ok) {
        setRoomDetail((prev) =>
          prev ? { ...prev, settings: updatedSettings } : null
        );
      }
    } catch (err) {
      console.error('Failed to update settings:', err);
    } finally {
      setUpdating(false);
    }
  };

  // 招待トークンの生成
  const handleGenerateInvite = async () => {
    try {
      const res = await client.api.v1.rooms[':roomId'].invite.$post(
        { param: { roomId } },
        { headers: getHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        setInviteToken(data.token);
        setCopied(false);
      }
    } catch (err) {
      console.error('Failed to generate invite token:', err);
    }
  };

  const handleCopyInviteLink = () => {
    if (!inviteToken) return;
    const inviteUrl = `${window.location.origin}/app/rooms/join?token=${inviteToken}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
    <div className="w-[320px] h-full bg-[#131316] border-l border-[#1F1F23] flex flex-col justify-between overflow-y-auto select-none shrink-0 z-20">
      {/* 上部: ルーム詳細＆トグル設定 */}
      <div className="p-5 flex flex-col gap-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between text-[#F5F5F7] border-b border-[#1F1F23]/60 pb-3">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-[#FF5722]" />
            <span className="font-bold text-base truncate max-w-[200px]">
              {roomDetail.name}
            </span>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-[#1F1F23] transition-colors border-0 text-[#8E8E93] hover:text-[#F5F5F7] cursor-pointer"
              aria-label="閉じる"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ルーム属性 */}
        <div className="flex flex-col gap-1.5 bg-[#0A0A0C]/30 border border-[#1F1F23]/60 p-3 rounded">
          <div className="flex justify-between items-center text-xs">
            <span className="text-[#8E8E93]">持続属性</span>
            <span className="font-bold text-[#F5F5F7]">
              {roomDetail.isEphemeral ? '一時ルーム (24 時間)' : '通常ルーム'}
            </span>
          </div>
        </div>

        {/* トグル設定一覧 */}
        <div className="flex flex-col gap-4">
          <span className="text-xs text-[#8E8E93] font-semibold tracking-wider">
            機能トグル設定 {!isAdmin && '(閲覧のみ)'}
          </span>

          <div className="flex flex-col gap-3">
            {/* 既読表示 */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-[#F5F5F7]">
                  既読マーク
                </span>
                <span className="text-[11px] text-[#8E8E93]">
                  メッセージ既読状態を同期
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleToggleSetting('isReadVisible')}
                disabled={!isAdmin || updating}
                className={`w-10 h-6 rounded-full transition-colors relative focus:outline-none border-0 ${
                  roomDetail.settings.isReadVisible
                    ? 'bg-[#FF5722]'
                    : 'bg-[#1F1F23]'
                } ${
                  !isAdmin || updating
                    ? 'opacity-50 cursor-not-allowed'
                    : 'cursor-pointer'
                }`}
                aria-label={`既読マーク機能トグル。現在: ${roomDetail.settings.isReadVisible ? '有効' : '無効'}`}
              >
                <span
                  className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${
                    roomDetail.settings.isReadVisible
                      ? 'translate-x-4'
                      : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* タイピング表示 */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-[#F5F5F7]">
                  タイピング中表示
                </span>
                <span className="text-[11px] text-[#8E8E93]">
                  キー入力中の気配を表示
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleToggleSetting('isTypingVisible')}
                disabled={!isAdmin || updating}
                className={`w-10 h-6 rounded-full transition-colors relative focus:outline-none border-0 ${
                  roomDetail.settings.isTypingVisible
                    ? 'bg-[#FF5722]'
                    : 'bg-[#1F1F23]'
                } ${
                  !isAdmin || updating
                    ? 'opacity-50 cursor-not-allowed'
                    : 'cursor-pointer'
                }`}
                aria-label={`タイピング中表示機能トグル。現在: ${roomDetail.settings.isTypingVisible ? '有効' : '無効'}`}
              >
                <span
                  className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${
                    roomDetail.settings.isTypingVisible
                      ? 'translate-x-4'
                      : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* スレッド機能 */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-[#F5F5F7]">
                  スレッド返信
                </span>
                <span className="text-[11px] text-[#8E8E93]">
                  メッセージへの個別リプライ
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleToggleSetting('isThreadEnabled')}
                disabled={!isAdmin || updating}
                className={`w-10 h-6 rounded-full transition-colors relative focus:outline-none border-0 ${
                  roomDetail.settings.isThreadEnabled
                    ? 'bg-[#FF5722]'
                    : 'bg-[#1F1F23]'
                } ${
                  !isAdmin || updating
                    ? 'opacity-50 cursor-not-allowed'
                    : 'cursor-pointer'
                }`}
                aria-label={`スレッド返信機能トグル。現在: ${roomDetail.settings.isThreadEnabled ? '有効' : '無効'}`}
              >
                <span
                  className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${
                    roomDetail.settings.isThreadEnabled
                      ? 'translate-x-4'
                      : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* メンション機能 */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-[#F5F5F7]">
                  メンション通知
                </span>
                <span className="text-[11px] text-[#8E8E93]">
                  特定の相手への呼びかけ通知
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleToggleSetting('isMentionEnabled')}
                disabled={!isAdmin || updating}
                className={`w-10 h-6 rounded-full transition-colors relative focus:outline-none border-0 ${
                  roomDetail.settings.isMentionEnabled
                    ? 'bg-[#FF5722]'
                    : 'bg-[#1F1F23]'
                } ${
                  !isAdmin || updating
                    ? 'opacity-50 cursor-not-allowed'
                    : 'cursor-pointer'
                }`}
                aria-label={`メンション通知機能トグル。現在: ${roomDetail.settings.isMentionEnabled ? '有効' : '無効'}`}
              >
                <span
                  className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${
                    roomDetail.settings.isMentionEnabled
                      ? 'translate-x-4'
                      : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* メンバー一覧 */}
        <div className="flex flex-col gap-3 border-t border-[#1F1F23] pt-4">
          <span className="text-xs text-[#8E8E93] font-semibold tracking-wider">
            メンバー一覧 ({roomDetail.members.length})
          </span>

          <div className="flex flex-col gap-2.5 max-h-48 overflow-y-auto">
            {roomDetail.members.map((m) => (
              <div key={m.userId} className="flex items-center gap-3">
                {/* メンバーアバター */}
                <div className="relative w-7 h-7 rounded-full bg-[#FF5722]/10 border border-[#FF5722]/20 flex items-center justify-center text-xs font-bold text-[#FF5722]">
                  {m.name.slice(0, 2).toUpperCase()}
                  <div
                    className={`absolute bottom-0 right-0 w-2 h-2 rounded-full ${getStatusColor(
                      m.statusLamp
                    )} border border-[#131316]`}
                  />
                </div>

                <div className="flex-1 flex items-center justify-between min-w-0">
                  <span className="text-sm text-[#F5F5F7] truncate">
                    {m.name}
                  </span>
                  {m.role === 'admin' ? (
                    <span className="text-[10px] bg-[#FF5722]/10 text-[#FF5722] border border-[#FF5722]/25 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5 shrink-0">
                      <Shield className="w-2.5 h-2.5" />
                      管理者
                    </span>
                  ) : (
                    <span className="text-[10px] bg-[#1F1F23] text-[#8E8E93] px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5 shrink-0">
                      <User className="w-2.5 h-2.5" />
                      メンバー
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 下部: 招待URL生成セクション */}
      <div className="p-5 border-t border-[#1F1F23] bg-[#0A0A0C]/20 flex flex-col gap-3">
        <span className="text-xs text-[#8E8E93] font-semibold">
          このルームに他の人を招待する
        </span>

        <button
          type="button"
          onClick={handleGenerateInvite}
          className="w-full h-10 bg-[#1F1F23] hover:bg-[#FF5722] hover:text-white text-[#F5F5F7] text-sm font-semibold rounded transition-colors border-0 cursor-pointer"
        >
          招待用の一時URLを発行
        </button>

        {inviteToken && (
          <div className="flex items-center gap-2 bg-[#18181C] border border-[#1F1F23] rounded p-2">
            <input
              type="text"
              readOnly
              value={`${window.location.origin}/app/rooms/join?token=${inviteToken}`}
              className="flex-1 bg-transparent border-0 text-[10px] text-[#8E8E93] focus:outline-none"
            />
            <button
              type="button"
              onClick={handleCopyInviteLink}
              className="p-1 hover:text-[#FF5722] text-[#8E8E93] transition-colors border-0 cursor-pointer"
              title="コピー"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        )}

        {copied && (
          <p className="text-[10px] text-[#4CAF50] text-center">
            リンクをクリップボードにコピーしました
          </p>
        )}
      </div>
    </div>
  );
}
