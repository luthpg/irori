import { useState } from 'react';
import type { ReactionItem } from '~/lib/schemas';

interface ReactionPillsProps {
  reactions: ReactionItem[];
  onToggleReaction: (emojiCode: string) => void;
}

const QUICK_STAMPS = [
  { emoji: '🔥', label: '聞いてるよ' },
  { emoji: '🍵', label: '一息ついてね' },
  { emoji: '🙏', label: 'ありがとう' },
  { emoji: '✨', label: 'いいね' },
  { emoji: '⛺', label: '秘密基地' },
];

/**
 * DESIGN.md 5.3: リアクションピル (Reaction Pill)
 * バブル下部に付くリアクション集計ピル。労わりスタンプ（🍵、🔥、🙏）をワンタップで追加可能。
 */
export function ReactionPills({
  reactions,
  onToggleReaction,
}: ReactionPillsProps) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2 relative">
      {reactions.map((reaction) => (
        <button
          key={reaction.emojiCode}
          type="button"
          onClick={() => onToggleReaction(reaction.emojiCode)}
          title={reaction.label || `${reaction.emojiCode} でリアクション`}
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium transition-all border ${
            reaction.me
              ? 'bg-[#261712] border-[#FF5722]/70 text-[#F5F5F7] shadow-[0_0_10px_rgba(255,87,34,0.18)]'
              : 'bg-[#18181C] border-white/[0.08] text-[#D4D4D8] hover:border-white/20'
          }`}
        >
          <span className="text-sm leading-none">{reaction.emojiCode}</span>
          <span className="font-mono text-xs">{reaction.count}</span>
        </button>
      ))}

      {/* リアクション追加ボタン (コンプ画像のスマイル＋アイコン準拠) */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowPicker((prev) => !prev)}
          title="労わりスタンプ・絵文字リアクションを追加"
          className="inline-flex items-center justify-center w-7 h-6 rounded-full bg-[#18181C] hover:bg-[#1F1F24] border border-white/[0.08] text-[#8E8E93] hover:text-[#F5F5F7] transition-colors text-xs"
        >
          ☺+
        </button>

        {showPicker && (
          <div className="absolute left-0 bottom-8 z-30 flex items-center gap-1 bg-[#1F1F24] border border-white/10 rounded-full px-2 py-1 shadow-xl">
            {QUICK_STAMPS.map((stamp) => (
              <button
                key={stamp.emoji}
                type="button"
                onClick={() => {
                  onToggleReaction(stamp.emoji);
                  setShowPicker(false);
                }}
                title={stamp.label}
                className="w-7 h-7 rounded-full hover:bg-[#261712] flex items-center justify-center text-sm transition-transform hover:scale-110"
              >
                {stamp.emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
