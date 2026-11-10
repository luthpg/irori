import { Link } from 'react-router';
import { StatusLampPicker } from '~/components/sidebar/status-lamp-picker';
import { IroriFlameLogo } from '~/components/ui/irori-icons';
import type { MockSpace, StatusLamp } from '~/lib/schemas';

interface NarrowRailProps {
  spaces: MockSpace[];
  activeSpaceId: string;
  onSelectSpace: (spaceId: string) => void;
  onOpenBookmarksDrawer: () => void;
  isBookmarksDrawerOpen: boolean;
  bookmarkCount: number;
  myStatusLamp: StatusLamp;
  myEphemeralMemo: string;
  onStatusChange: (status: StatusLamp) => void;
  onMemoChange: (memo: string) => void;
}

export function NarrowRail({
  spaces,
  activeSpaceId,
  onSelectSpace,
  onOpenBookmarksDrawer,
  isBookmarksDrawerOpen,
  bookmarkCount,
  myStatusLamp,
  myEphemeralMemo,
  onStatusChange,
  onMemoChange,
}: NarrowRailProps) {
  return (
    <aside
      aria-label="スペースおよび個人メニュー"
      className="w-16 shrink-0 bg-[#0D0D10] border-r border-[#1F1F24] flex flex-col items-center py-3 select-none justify-between relative z-20"
    >
      {/* 上部ロゴ ＆ スペースアイコン一覧 */}
      <div className="flex flex-col items-center w-full gap-2">
        {/* ウィンドウ装飾ドット（コンプ画像の雰囲気再現） */}
        <div className="flex items-center gap-1.5 mb-1 opacity-80">
          <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#22C55E]" />
        </div>

        {/* Irori メインシンボル */}
        <Link
          to="/welcome"
          title="Irori ホーム"
          className="w-11 h-11 rounded-xl flex items-center justify-center hover:bg-[#18181C] transition-colors mb-1"
        >
          <IroriFlameLogo className="w-8 h-8" glowing />
        </Link>

        <div className="w-8 h-px bg-[#1F1F24] mb-1" />

        {/* 参加スペース一覧 */}
        {spaces.map((space) => {
          const isActive = space.id === activeSpaceId;
          return (
            <div
              key={space.id}
              className="relative w-full flex items-center justify-center py-1"
            >
              {/* DESIGN.md 4.1: 選択中スペースの左端にオレンジ縦線バー (3px) */}
              {isActive && (
                <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full bg-[#FF5722] shadow-[0_0_8px_#FF5722]" />
              )}

              <button
                type="button"
                onClick={() => onSelectSpace(space.id)}
                title={`${space.name} (${space.badge})`}
                className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                  isActive
                    ? 'bg-[#261712] text-[#FF5722] ring-1 ring-[#FF5722]/40 shadow-[0_0_16px_rgba(255,87,34,0.2)]'
                    : 'text-[#8E8E93] hover:text-[#F5F5F7] hover:bg-[#18181C]'
                }`}
              >
                {/* 会話熱量に応じた微光リング */}
                {!isActive && space.heatLevel > 0.5 && (
                  <span className="absolute inset-0 rounded-xl ring-1 ring-[#FF5722]/30 animate-pulse pointer-events-none" />
                )}

                {space.iconType === 'flame' && (
                  <IroriFlameLogo className="w-6 h-6" glowing={isActive} />
                )}

                {space.iconType === 'users' && (
                  <svg
                    viewBox="0 0 24 24"
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M17 20h5v-1a4 4 0 00-3-3.87M9 20H4v-1a4 4 0 015-3.87m8 4.87v-1a4 4 0 00-3-3.87m0 0a4 4 0 100-7.75m-4 7.75a4 4 0 110-8 4 4 0 010 8z"
                    />
                  </svg>
                )}

                {space.iconType === 'chat' && (
                  <svg
                    viewBox="0 0 24 24"
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8 10h8M8 14h4m-6 6l-4 1 1-4V6a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H6z"
                    />
                  </svg>
                )}

                {/* 気配ドット (緑) */}
                {space.iconType === 'users' && space.hasQuietActivity && (
                  <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-[#22C55E] border-2 border-[#0D0D10]" />
                )}

                {/* 未読バッジ (#EA580C) */}
                {space.unreadCount > 0 && space.iconType !== 'flame' && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#EA580C] text-white text-[10px] font-bold flex items-center justify-center border-2 border-[#0D0D10]">
                    {space.unreadCount}
                  </span>
                )}
              </button>
            </div>
          );
        })}

        {/* 自分専用メモ・ブックマーク */}
        <button
          type="button"
          onClick={onOpenBookmarksDrawer}
          title="自分専用メモ・ブックマーク"
          className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition-colors mt-1 ${
            isBookmarksDrawerOpen
              ? 'bg-[#261712] text-[#FF5722] ring-1 ring-[#FF5722]/40'
              : 'text-[#8E8E93] hover:text-[#F5F5F7] hover:bg-[#18181C]'
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7 8h10M7 12h6m-8 8l3.5-3H19a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v15z"
            />
          </svg>
          {bookmarkCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#1F1F24] text-[#FF5722] text-[10px] font-semibold flex items-center justify-center border border-[#FF5722]/40">
              {bookmarkCount}
            </span>
          )}
        </button>

        {/* 設定へ */}
        <Link
          to="/settings"
          title="設定"
          className="relative w-11 h-11 rounded-xl flex items-center justify-center text-[#8E8E93] hover:text-[#F5F5F7] hover:bg-[#18181C] transition-colors"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <rect x="4" y="4" width="6" height="6" rx="1.5" />
            <rect x="14" y="4" width="6" height="6" rx="1.5" />
            <rect x="4" y="14" width="6" height="6" rx="1.5" />
            <rect x="14" y="14" width="6" height="6" rx="1.5" />
          </svg>
          <span className="absolute -top-1 -right-1 px-1 h-[18px] rounded-full bg-[#EA580C] text-white text-[10px] font-bold flex items-center justify-center border-2 border-[#0D0D10]">
            9+
          </span>
        </Link>
      </div>

      {/* 下部: ステータスランプ切替 ＆ 鍵復元・引き継ぎ画面への導線 */}
      <div className="flex flex-col items-center gap-2.5">
        <StatusLampPicker
          currentStatus={myStatusLamp}
          ephemeralMemo={myEphemeralMemo}
          onStatusChange={onStatusChange}
          onMemoChange={onMemoChange}
        />

        <Link
          to="/restore-key"
          title="暗号鍵のバックアップ・復元"
          className="w-11 h-11 rounded-xl flex items-center justify-center text-[#8E8E93] hover:text-[#FF5722] hover:bg-[#18181C] transition-colors"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
            />
          </svg>
        </Link>

        <Link
          to="/welcome"
          title="ログイン画面を表示"
          className="w-11 h-11 rounded-xl flex items-center justify-center text-[#8E8E93] hover:text-[#F5F5F7] hover:bg-[#18181C] transition-colors"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"
            />
          </svg>
        </Link>
      </div>
    </aside>
  );
}
