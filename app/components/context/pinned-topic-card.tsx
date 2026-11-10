import { useState } from 'react';

interface PinnedTopicCardProps {
  title: string;
  description: string;
  updatedAt: string;
  commentCount: number;
  onOpenTopicThread: () => void;
}

/**
 * plan.components.md 3.3: PinnedTopicCard
 * チャンネル上部に固定される非同期トークテーマ（お題カード）。
 */
export function PinnedTopicCard({
  title,
  description,
  updatedAt,
  commentCount,
  onOpenTopicThread,
}: PinnedTopicCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="mb-4 sm:mb-5 rounded-xl bg-[#18181C]/90 border border-[#FF5722]/25 p-3 sm:p-3.5 shadow-lg relative z-10">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 sm:gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="mt-0.5 px-2 py-0.5 rounded-md bg-[#261712] text-[#FF7A45] border border-[#FF5722]/30 text-[11px] font-semibold shrink-0">
            📌 ピン留め
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[#F5F5F7] leading-snug">
              {title}
            </h3>
            {!isCollapsed && (
              <p className="text-xs text-[#8E8E93] mt-1 leading-relaxed">
                {description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 shrink-0 pt-1 sm:pt-0">
          <button
            type="button"
            onClick={onOpenTopicThread}
            className="px-2.5 py-1 rounded-lg bg-[#261712] hover:bg-[#FF5722]/25 border border-[#FF5722]/35 text-xs text-[#FF7A45] font-medium transition-colors"
          >
            💬 スレッドを開く ({commentCount})
          </button>
          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="text-xs text-[#8E8E93] hover:text-[#F5F5F7] px-1.5 py-1"
            title={isCollapsed ? 'ピン留めを展開' : 'ピン留めを折りたたむ'}
          >
            {isCollapsed ? '展開' : '隠す'}
          </button>
        </div>
      </div>
      {!isCollapsed && (
        <div className="mt-2 pt-2 border-t border-white/[0.05] flex items-center justify-between text-[11px] text-[#636366]">
          <span>ピン留めされたメッセージ</span>
          <span>最終更新: {updatedAt}</span>
        </div>
      )}
    </div>
  );
}
