'use client';

import { Flame, Menu } from 'lucide-react';
import { useAppContext } from '@/hooks/useAppContext';

export default function AppPage() {
  const { isSidebarOpen, setIsSidebarOpen } = useAppContext();

  return (
    <div className="flex flex-col flex-1 h-full bg-[#0A0A0C] text-[#F5F5F7]">
      {/* モバイルヘッダー */}
      <header className="md:hidden flex h-14 items-center px-4 border-b border-[#1F1F23] justify-between shrink-0">
        <button
          type="button"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-1 text-[#8E8E93] hover:text-[#F5F5F7] hover:bg-[#1F1F23] rounded transition-colors border-0 cursor-pointer"
          aria-label="ルーム一覧を開く"
        >
          <Menu className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-1.5 font-bold">
          <Flame className="w-5 h-5 text-[#FF5722]" />
          <span>Irori</span>
        </div>
        <div className="w-8" />
      </header>

      {/* メインウェルカムボディ */}
      <div className="flex flex-col flex-1 items-center justify-center text-center p-6 select-none gap-6">
        <div className="w-20 h-20 rounded-full bg-[#131316] border border-[#1F1F23] flex items-center justify-center shadow-lg relative group">
          <div className="absolute inset-0 rounded-full bg-[#FF5722] opacity-5 blur-md group-hover:opacity-10 transition-opacity" />
          <Flame className="w-10 h-10 text-[#FF5722] animate-pulse" />
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-bold">囲炉裏の気配を感じています</h2>
          <p className="text-sm text-[#8E8E93] max-w-xs leading-relaxed">
            会話を始めるには、サイドバーから部屋を選択するか、新しく「ルームを作成」してください。
          </p>
        </div>

        {/* モバイル環境用のアクションボタン */}
        <button
          type="button"
          onClick={() => setIsSidebarOpen(true)}
          className="md:hidden h-10 px-4 rounded bg-[#FF5722] text-white text-sm font-semibold hover:bg-[#E64A19] transition-colors border-0 cursor-pointer"
        >
          ルーム一覧を開く
        </button>
      </div>
    </div>
  );
}
