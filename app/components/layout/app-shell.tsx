interface AppShellProps {
  narrowRail: React.ReactNode;
  channelSidebar?: React.ReactNode;
  mainTimeline: React.ReactNode;
  contextDrawer?: React.ReactNode;
  mobileBottomBar?: React.ReactNode;
  isMobileSidebarOpen?: boolean;
  onCloseMobileSidebar?: () => void;
}

/**
 * DESIGN.md 4 & plan.components.md 1.2: レスポンシブ 4 ペイン・アーキテクチャ
 * デスクトップ: [Narrow Rail: 64px] [Sidebar: 280px] [Timeline: flex-1] [Context Drawer: 340px]
 * モバイル (< md): タイムラインを全画面表示し、サイドバー・コンテキストはスライドインドロワーとして展開
 */
export function AppShell({
  narrowRail,
  channelSidebar,
  mainTimeline,
  contextDrawer,
  mobileBottomBar,
  isMobileSidebarOpen = false,
  onCloseMobileSidebar,
}: AppShellProps) {
  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0A0A0C] text-[#F5F5F7] flex flex-col">
      {/* メインペインコンテナ */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* デスクトップ用固定サイドバー */}
        <div className="hidden md:flex shrink-0">{narrowRail}</div>
        {channelSidebar && (
          <div className="hidden md:flex shrink-0">{channelSidebar}</div>
        )}

        {/* メインチャットタイムライン */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#0D0D10] relative">
          {mainTimeline}
        </main>

        {/* コンテキストドロワー（スレッド / ブックマーク） */}
        {contextDrawer}

        {/* モバイル用スライドイン・サイドバードロワー (< md) */}
        {isMobileSidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            {/* バックドロップ (タップで閉じる) */}
            <button
              type="button"
              aria-label="サイドバーを閉じる"
              onClick={onCloseMobileSidebar}
              className="fixed inset-0 bg-black/65 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            />

            {/* ドロワー本体 */}
            <div className="relative z-10 flex h-full max-w-[85vw] bg-[#0D0D10] shadow-2xl animate-in slide-in-from-left duration-250">
              {/* Narrow Rail */}
              <div className="shrink-0">{narrowRail}</div>
              {/* Channel Sidebar */}
              {channelSidebar && (
                <div className="shrink-0 flex-1 min-w-0">{channelSidebar}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* モバイル用下部ナビゲーションバー */}
      {mobileBottomBar}
    </div>
  );
}
