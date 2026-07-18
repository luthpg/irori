'use client';

import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { ChatArea } from '@/components/chat/chat-area';
import { SettingsPanel } from '@/components/settings/settings-panel';
import { useAppContext } from '@/hooks/useAppContext';

export default function RoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  const { setActiveRoomId, isSettingsOpen, setIsSettingsOpen } =
    useAppContext();

  // URLの roomId の変化に合わせて Context の選択中のルーム状態を同期
  useEffect(() => {
    if (roomId) {
      setActiveRoomId(roomId);
    }
    return () => {
      setActiveRoomId(null);
    };
  }, [roomId, setActiveRoomId]);

  return (
    <div className="flex flex-1 h-full min-w-0 select-none overflow-hidden relative">
      {/* 中央: チャットエリア */}
      <ChatArea roomId={roomId} />

      {/* 右側詳細設定パネル (デスクトップ: 固定表示 / モバイル・タブレット: オーバーレイシート表示) */}
      {/* 1. デスクトップ環境 (xl 以上で固定表示、isSettingsOpen トグル状態に関係なく表示するか、またはトグル状態で開閉) */}
      {isSettingsOpen && (
        <div className="hidden xl:flex h-full shrink-0 animate-fade-in-right">
          <SettingsPanel
            roomId={roomId}
            onClose={() => setIsSettingsOpen(false)}
          />
        </div>
      )}

      {/* 2. モバイル＆タブレット環境 (xl 未満で isSettingsOpen が true の時のみオーバーレイ表示) */}
      {isSettingsOpen && (
        <div className="xl:hidden fixed inset-0 z-40 flex justify-end">
          {/* 背景の薄暗いマスク */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(false)}
            className="fixed inset-0 bg-[#0A0A0C]/80 backdrop-blur-sm border-0 cursor-pointer w-full h-full"
            aria-label="詳細設定を閉じる"
          />
          {/* パネル本体 */}
          <div className="relative flex h-full z-10 shadow-2xl animate-duration-200">
            <SettingsPanel
              roomId={roomId}
              onClose={() => setIsSettingsOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
