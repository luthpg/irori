'use client';

import { Flame, LayoutGrid, LogOut, MessageSquare, Users } from 'lucide-react';
import { useState } from 'react';
import { useAppContext } from '@/hooks/useAppContext';
import { StatusLampPicker } from './status-lamp-picker';

export function NarrowSidebar() {
  const { user, logoutUser, isSidebarOpen, setIsSidebarOpen } = useAppContext();
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  if (!user) return null;

  // ステータスランプの色
  const getStatusColor = (status: typeof user.statusLamp) => {
    switch (status) {
      case 'free':
        return 'bg-[#4CAF50]'; // ひま (緑)
      case 'busy':
        return 'bg-[#FF3B30]'; // 作業中 (赤)
      case 'away':
        return 'bg-[#FFCC00]'; // 離席 (黄)
      default:
        return 'bg-[#8E8E93]';
    }
  };

  return (
    <div className="w-[60px] h-full bg-[#0A0A0C] border-r border-[#1F1F23] flex flex-col items-center py-4 justify-between relative select-none">
      {/* 上部: ロゴと炎マーク */}
      <div className="flex flex-col items-center gap-6">
        <div className="w-10 h-10 rounded-full bg-[#131316] border border-[#1F1F23] flex items-center justify-center relative shadow">
          <Flame className="w-5 h-5 text-[#FF5722]" />
        </div>

        {/* ナビゲーションアイコン一覧 */}
        <div className="flex flex-col items-center gap-4 w-full">
          {/* 囲炉裏タブ (アクティブ表示) */}
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-full h-10 flex items-center justify-center relative text-[#FF5722] hover:text-[#FF5722] transition-colors"
          >
            {/* 左端のオレンジインジケーター */}
            <div className="absolute left-0 top-1/4 bottom-1/4 w-[3px] bg-[#FF5722] rounded-r" />
            <Flame className="w-5 h-5" />
          </button>

          {/* つながり (フレンド) */}
          <button
            type="button"
            className="w-full h-10 flex items-center justify-center relative text-[#8E8E93] hover:text-[#F5F5F7] transition-colors"
          >
            <Users className="w-5 h-5" />
          </button>

          {/* 未読チャットバッジ */}
          <button
            type="button"
            className="w-full h-10 flex items-center justify-center relative text-[#8E8E93] hover:text-[#F5F5F7] transition-colors"
          >
            <MessageSquare className="w-5 h-5" />
            <span className="absolute top-1 right-2 bg-[#FF5722] text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center border border-[#0A0A0C]">
              3
            </span>
          </button>

          {/* グリッドアイコン */}
          <button
            type="button"
            className="w-full h-10 flex items-center justify-center relative text-[#8E8E93] hover:text-[#F5F5F7] transition-colors"
          >
            <LayoutGrid className="w-5 h-5" />
            <span className="absolute top-1 right-2 bg-[#FF5722] text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center border border-[#0A0A0C]">
              9+
            </span>
          </button>
        </div>
      </div>

      {/* 下部: ユーザーランプとログアウト */}
      <div className="flex flex-col items-center gap-4 relative">
        {/* ステータスランプピッカーへのトリガー */}
        <button
          type="button"
          onClick={() => setShowStatusPicker(!showStatusPicker)}
          className="relative w-8 h-8 rounded-full bg-[#131316] border border-[#1F1F23] flex items-center justify-center hover:bg-[#18181C] transition-colors"
          aria-label={`ステータスを変更。現在のステータス: ${user.statusLamp}`}
        >
          {/* オンラインステータスランプ */}
          <div
            className={`w-3.5 h-3.5 rounded-full ${getStatusColor(user.statusLamp)} shadow-sm`}
          />
        </button>

        {/* 状態ピッカーポップオーバー */}
        {showStatusPicker && (
          <div className="absolute bottom-12 left-10 z-50">
            <StatusLampPicker onClose={() => setShowStatusPicker(false)} />
          </div>
        )}

        {/* ログアウトボタン */}
        <button
          type="button"
          onClick={logoutUser}
          className="w-10 h-10 flex items-center justify-center text-[#8E8E93] hover:text-[#FF3B30] transition-colors"
          aria-label="ログアウト"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
