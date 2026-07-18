'use client';

import { Flame } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type React from 'react';
import { useEffect } from 'react';
import { NarrowSidebar } from '@/components/sidebar/narrow-sidebar';
import { SidebarContainer } from '@/components/sidebar/sidebar-container';
import { AppProvider, useAppContext } from '@/hooks/useAppContext';

function AppLayoutContent({ children }: { children: React.ReactNode }) {
  const { user, loading, isSidebarOpen, setIsSidebarOpen } = useAppContext();
  const router = useRouter();

  // 認証情報の読み込みが完了し、ユーザーが存在しない場合は LP (/) へリダイレクト
  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0A0A0C] text-[#F5F5F7]">
        <div className="flex flex-col items-center gap-4">
          <Flame className="w-12 h-12 text-[#FF5722] animate-pulse" />
          <p className="text-[#8E8E93] text-base animate-pulse">
            囲炉裏に火をくべています...
          </p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0A0A0C] text-[#F5F5F7] font-sans">
      {/* デスクトップ＆タブレット: サイドバーを左端に固定表示 */}
      <div className="hidden md:flex h-full shrink-0">
        <NarrowSidebar />
        <SidebarContainer />
      </div>

      {/* モバイル: ナビゲーションドロワー (スライドオーバーレイ) */}
      {isSidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          {/* 背景の薄暗いマスク */}
          <button
            type="button"
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-[#0A0A0C]/80 backdrop-blur-sm border-0 cursor-pointer w-full h-full"
            aria-label="サイドバーを閉じる"
          />
          {/* サイドバー本体の配置 */}
          <div className="relative flex h-full z-10 shadow-2xl animate-duration-200">
            <NarrowSidebar />
            <SidebarContainer />
          </div>
        </div>
      )}

      {/* チャットコンテンツ表示領域 */}
      <div className="flex flex-col flex-1 h-full min-w-0 relative">
        {children}
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <AppLayoutContent>{children}</AppLayoutContent>
    </AppProvider>
  );
}
