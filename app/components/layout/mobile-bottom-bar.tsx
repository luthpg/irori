import { Link } from 'react-router';

interface MobileBottomBarProps {
  onToggleMobileChannels: () => void;
  onOpenBookmarks: () => void;
  bookmarkCount: number;
  isMobileChannelsOpen?: boolean;
  isBookmarksOpen?: boolean;
}

/**
 * plan.components.md 2: mobile-bottom-bar.tsx
 * モバイル環境 (< md) 用の下部固定ナビゲーションバー（最小タップ領域 44×44px 準拠 ＆ iOS Safe Area 対応）。
 */
export function MobileBottomBar({
  onToggleMobileChannels,
  onOpenBookmarks,
  bookmarkCount,
  isMobileChannelsOpen = false,
  isBookmarksOpen = false,
}: MobileBottomBarProps) {
  return (
    <nav
      aria-label="モバイル下部ナビゲーション"
      className="md:hidden shrink-0 min-h-[56px] pb-[env(safe-area-inset-bottom)] bg-[#0D0D10]/95 backdrop-blur-md border-t border-[#1F1F24] px-2 flex items-center justify-around z-30"
    >
      <button
        type="button"
        onClick={onToggleMobileChannels}
        className={`min-w-[52px] min-h-[48px] px-2 py-1 flex flex-col items-center justify-center rounded-xl text-xs transition-colors ${
          isMobileChannelsOpen
            ? 'bg-[#261712] text-[#FF7A45] font-semibold'
            : 'text-[#8E8E93] hover:text-[#F5F5F7]'
        }`}
      >
        <span className="text-base leading-none">💬</span>
        <span className="text-[10px] mt-1">チャンネル</span>
      </button>

      <button
        type="button"
        onClick={onOpenBookmarks}
        className={`min-w-[52px] min-h-[48px] px-2 py-1 flex flex-col items-center justify-center rounded-xl text-xs transition-colors ${
          isBookmarksOpen
            ? 'bg-[#261712] text-[#FF7A45] font-semibold'
            : 'text-[#8E8E93] hover:text-[#F5F5F7]'
        }`}
      >
        <span className="text-base leading-none">
          🔖{bookmarkCount > 0 ? ` (${bookmarkCount})` : ''}
        </span>
        <span className="text-[10px] mt-1">メモ</span>
      </button>

      <Link
        to="/restore-key"
        className="min-w-[52px] min-h-[48px] px-2 py-1 flex flex-col items-center justify-center rounded-xl text-xs text-[#8E8E93] hover:text-[#F5F5F7] transition-colors"
      >
        <span className="text-base leading-none">🔑</span>
        <span className="text-[10px] mt-1">鍵バックアップ</span>
      </Link>

      <Link
        to="/settings"
        className="min-w-[52px] min-h-[48px] px-2 py-1 flex flex-col items-center justify-center rounded-xl text-xs text-[#8E8E93] hover:text-[#F5F5F7] transition-colors"
      >
        <span className="text-base leading-none">⚙️</span>
        <span className="text-[10px] mt-1">設定</span>
      </Link>
    </nav>
  );
}
