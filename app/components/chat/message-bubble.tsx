import { useState } from 'react';
import { ReactionPills } from '~/components/chat/reaction-pills';
import {
  CampfireThumbnailSvg,
  MemberAvatar,
} from '~/components/ui/irori-icons';
import { useBudouX } from '~/hooks/useBudouX';
import type { ChannelSettings, MockMessage } from '~/lib/schemas';

interface MessageBubbleProps {
  message: MockMessage;
  settings: ChannelSettings;
  onToggleReaction: (messageId: string, emojiCode: string) => void;
  onOpenThread: (messageId: string) => void;
  onAddBookmark: (message: MockMessage) => void;
  onEditMessage: (messageId: string, newContent: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onVoteWorkflow?: (
    messageId: string,
    optionId: string,
    vote: 'yes' | 'maybe' | 'no',
  ) => void;
}

export function MessageBubble({
  message,
  settings,
  onToggleReaction,
  onOpenThread,
  onAddBookmark,
  onEditMessage,
  onDeleteMessage,
  onVoteWorkflow,
}: MessageBubbleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.content);
  const formattedContent = useBudouX(message.content);

  const displayName = settings.isAnonymousMode
    ? message.anonymousId
    : message.senderName;

  const renderWorkflowCard = () => {
    if (!message.workflow) return null;
    const wf = message.workflow;

    if (wf.type === 'schedule' && wf.options) {
      return (
        <div className="mt-3 rounded-xl bg-[#131316] border border-white/[0.08] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#FF7A45]">
              {wf.title}
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1F1F24] text-[#8E8E93]">
              E2EE Workflow
            </span>
          </div>
          <div className="space-y-2">
            {wf.options.map((opt) => (
              <div
                key={opt.id}
                className="p-2.5 rounded-lg bg-[#18181C] border border-white/[0.05] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <span className="text-xs font-medium text-[#F5F5F7]">
                  {opt.label}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onVoteWorkflow?.(message.id, opt.id, 'yes')}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors border ${
                      opt.myVote === 'yes'
                        ? 'bg-[#261712] border-[#FF5722] text-[#FF7A45]'
                        : 'bg-[#131316] border-white/10 text-[#8E8E93] hover:text-[#F5F5F7]'
                    }`}
                  >
                    ◯ 参加 ({opt.yesCount})
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onVoteWorkflow?.(message.id, opt.id, 'maybe')
                    }
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors border ${
                      opt.myVote === 'maybe'
                        ? 'bg-[#261712] border-[#FF5722] text-[#FF7A45]'
                        : 'bg-[#131316] border-white/10 text-[#8E8E93] hover:text-[#F5F5F7]'
                    }`}
                  >
                    △ 未定 ({opt.maybeCount})
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (wf.type === 'focus_timer') {
      return (
        <div className="mt-3 rounded-xl bg-[#131316] border border-[#FF5722]/30 p-3.5 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-[#FF7A45]">
              {wf.title}
            </div>
            <div className="text-[11px] text-[#8E8E93] mt-0.5">
              集中時間中はプッシュ通知を自動抑制しています
            </div>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-[#261712] border border-[#FF5722]/40 font-mono text-sm font-bold text-[#F5F5F7]">
            残り {wf.timerMinutes ?? 25}:00
          </div>
        </div>
      );
    }

    return null;
  };

  const renderMediaAttachment = () => {
    if (!message.media) return null;
    return (
      <div className="mt-2 mb-1 rounded-xl bg-[#1F1F24]/90 border border-white/[0.08] p-3.5 max-w-xl">
        <div className="flex items-start gap-3.5">
          <CampfireThumbnailSvg />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-sm font-medium text-[#D4D4D8]">
              {/* Google Drive / R2 アイコン */}
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4 shrink-0"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M8 3h8l5 9-4 7H7L3 12 8 3z"
                  fill="#22C55E"
                  opacity="0.85"
                />
                <path d="M8 3l4 7 4-7H8z" fill="#3B82F6" />
                <path d="M3 12l4 7h10l4-7H3z" fill="#F59E0B" opacity="0.9" />
              </svg>
              <span className="truncate">{message.media.provider}</span>
            </div>
            <div className="text-sm text-[#A1A1AA] mt-1.5 leading-snug">
              {message.media.title}
            </div>
            <div className="text-[11px] text-[#636366] font-mono mt-1">
              {message.media.subtitle}
            </div>
          </div>
        </div>
        <div className="mt-3 text-base text-[#F5F5F7] budoux-text">
          {formattedContent}
        </div>
      </div>
    );
  };

  // 自分のメッセージ
  if (message.isOwn) {
    return (
      <article className="group flex flex-col items-end relative z-10">
        <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 mb-1 px-1">
          {message.deliveryMode === 'when_free' && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#18181C] border border-[#22C55E]/40 text-[#22C55E]">
              🟢 相手のオンライン時に送信（待機中）
            </span>
          )}
          <span className="text-xs font-medium text-[#FF7A45]">
            {displayName}
          </span>
          <span className="text-xs text-[#8E8E93] font-mono">
            {message.timestamp}
          </span>
        </div>

        <div className="max-w-[92%] sm:max-w-[70%] rounded-xl bg-[#261712] border border-[#FF5722]/30 px-3.5 sm:px-4 py-2.5 sm:py-3 shadow-[0_2px_12px_rgba(0,0,0,0.35)] relative">
          {isEditing ? (
            <div className="space-y-2 min-w-[240px] sm:min-w-[260px]">
              <textarea
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                rows={2}
                className="w-full rounded-lg bg-[#131316] border border-[#FF5722]/50 p-2 text-sm text-[#F5F5F7]"
              />
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-2.5 py-1 rounded bg-[#18181C] text-xs text-[#8E8E93]"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onEditMessage(message.id, editDraft);
                    setIsEditing(false);
                  }}
                  className="px-2.5 py-1 rounded bg-[#FF5722] text-white text-xs font-medium"
                >
                  保存
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm sm:text-base text-[#F5F5F7] budoux-text whitespace-pre-wrap leading-relaxed">
              {formattedContent}
            </p>
          )}

          {renderWorkflowCard()}
        </div>

        {/* バブル外の下端脇メタデータ ＆ 操作バー */}
        <div className="flex flex-wrap items-center justify-end gap-x-2.5 sm:gap-x-3 gap-y-1 mt-1 px-1 text-[11px] text-[#8E8E93]">
          <span className="font-mono">🔒 E2EE (Epoch {message.keyEpoch})</span>
          {message.isEdited && <span>(編集済み)</span>}
          {settings.isReadVisible && message.readCount != null && (
            <span className="text-[#FF7A45]">既読 {message.readCount}</span>
          )}
          {(settings.isEphemeral || message.expiresIn) && (
            <span className="text-[#F59E0B]">
              ⏳ {message.expiresIn || '24時間後に消去'}
            </span>
          )}

          {/* クイック操作 (編集 / 削除 / スレッド / ブックマーク) */}
          <div className="opacity-90 sm:opacity-80 sm:group-hover:opacity-100 flex items-center gap-2 transition-opacity">
            {settings.isThreadEnabled && (
              <button
                type="button"
                onClick={() => onOpenThread(message.id)}
                className="hover:text-[#FF7A45] underline underline-offset-2 py-0.5"
              >
                スレッド
                {message.threadCount ? ` (${message.threadCount})` : ''}
              </button>
            )}
            <button
              type="button"
              onClick={() => onAddBookmark(message)}
              className="hover:text-[#F5F5F7] py-0.5"
              title="非公開メモに追加"
            >
              🔖 メモ
            </button>
            <button
              type="button"
              onClick={() => {
                setEditDraft(message.content);
                setIsEditing(true);
              }}
              className="hover:text-[#F5F5F7] py-0.5"
            >
              編集
            </button>
            <button
              type="button"
              onClick={() => onDeleteMessage(message.id)}
              className="hover:text-[#EF4444] py-0.5"
              title="メッセージを削除"
            >
              削除
            </button>
          </div>
        </div>

        <ReactionPills
          reactions={message.reactions}
          onToggleReaction={(emoji) => onToggleReaction(message.id, emoji)}
        />
      </article>
    );
  }

  // 相手のメッセージ (左寄せ・コンプ画像準拠レイアウト + #18181C サーフェス)
  return (
    <article className="group flex items-start gap-2.5 sm:gap-3.5 relative z-10">
      <div className="mt-0.5 shrink-0">
        <MemberAvatar
          avatarType={message.avatarType}
          statusLamp={message.statusLamp}
          isAnonymous={settings.isAnonymousMode}
          size="lg"
        />
      </div>

      <div className="flex-1 min-w-0 max-w-[92%] sm:max-w-[75%]">
        {/* 送信者名 + タイムスタンプ */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-1">
          <span className="text-sm sm:text-base font-bold text-[#F5F5F7]">
            {displayName}
          </span>
          <span className="text-xs text-[#8E8E93] font-mono">
            {message.timestamp}
          </span>
          {settings.isReadVisible && message.readCount != null && (
            <span className="text-[11px] text-[#636366]">
              既読 {message.readCount}
            </span>
          )}
          {(settings.isEphemeral || message.expiresIn) && (
            <span className="text-[11px] text-[#F59E0B]">
              ⏳ {message.expiresIn || '24時間後に消去'}
            </span>
          )}
        </div>

        {/* メディア添付カードがある場合はメッセージ形式で描画、通常時は #18181C バブル */}
        {message.media ? (
          renderMediaAttachment()
        ) : (
          <div className="inline-block rounded-xl bg-[#18181C] border border-white/[0.06] px-3.5 sm:px-4 py-2 sm:py-2.5 shadow-sm">
            <p className="text-sm sm:text-base text-[#F5F5F7] budoux-text whitespace-pre-wrap leading-relaxed">
              {formattedContent}
            </p>
            {renderWorkflowCard()}
          </div>
        )}

        {/* リアクションピル ＋ スレッド・個人ブックマークアクション */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <ReactionPills
            reactions={message.reactions}
            onToggleReaction={(emoji) => onToggleReaction(message.id, emoji)}
          />

          <div className="mt-1.5 sm:mt-2 flex items-center gap-2 text-xs text-[#8E8E93] opacity-90 sm:opacity-85 sm:group-hover:opacity-100 transition-opacity">
            {settings.isThreadEnabled && (
              <button
                type="button"
                onClick={() => onOpenThread(message.id)}
                className="px-2 py-0.5 rounded-md bg-[#18181C] hover:bg-[#1F1F24] border border-white/[0.06] text-[#D4D4D8] hover:text-[#FF7A45] transition-colors min-h-[28px] inline-flex items-center"
              >
                💬 スレッド
                {message.threadCount ? ` (${message.threadCount})` : '返信'}
              </button>
            )}
            <button
              type="button"
              onClick={() => onAddBookmark(message)}
              className="px-2 py-0.5 rounded-md bg-[#18181C] hover:bg-[#1F1F24] border border-white/[0.06] text-[#8E8E93] hover:text-[#F5F5F7] transition-colors min-h-[28px] inline-flex items-center"
              title="非公開メモに追加"
            >
              🔖 メモ
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
