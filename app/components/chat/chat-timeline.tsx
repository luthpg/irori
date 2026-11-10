import { AmbientGlow } from '~/components/chat/ambient-glow';
import { MessageBubble } from '~/components/chat/message-bubble';
import { PinnedTopicCard } from '~/components/context/pinned-topic-card';
import type { ChannelSettings, MockChannel, MockMessage } from '~/lib/schemas';

interface ChatTimelineProps {
  channel: MockChannel;
  messages: MockMessage[];
  heatLevel: number;
  typingUsers: string[];
  isManuallyUnread: boolean;
  onToggleReaction: (messageId: string, emojiCode: string) => void;
  onOpenThread: (messageId: string) => void;
  onAddBookmark: (message: MockMessage) => void;
  onEditMessage: (messageId: string, newContent: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onVoteWorkflow: (
    messageId: string,
    optionId: string,
    vote: 'yes' | 'maybe' | 'no',
  ) => void;
}

export function ChatTimeline({
  channel,
  messages,
  heatLevel,
  typingUsers,
  isManuallyUnread,
  onToggleReaction,
  onOpenThread,
  onAddBookmark,
  onEditMessage,
  onDeleteMessage,
  onVoteWorkflow,
}: ChatTimelineProps) {
  const settings: ChannelSettings = channel.settings;

  return (
    <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-3 sm:py-5 relative">
      {/* 会話熱量に応じたアンビエントライト演出 */}
      <AmbientGlow heatLevel={heatLevel} />

      {/* チャンネル上部固定のピン留めトピックカード */}
      <PinnedTopicCard
        title={channel.pinnedTopic.title}
        description={channel.pinnedTopic.description}
        updatedAt={channel.pinnedTopic.updatedAt}
        commentCount={channel.pinnedTopic.commentCount}
        onOpenTopicThread={() => {
          if (messages[0]) {
            onOpenThread(messages[0].id);
          }
        }}
      />

      {/* ワンタップ「未読に戻す」有効時のセパレーター */}
      {isManuallyUnread && (
        <div className="my-3 sm:my-4 flex items-center gap-3 relative z-10">
          <div className="flex-1 h-px bg-[#FF5722]/40" />
          <span className="px-3 py-0.5 rounded-full bg-[#261712] border border-[#FF5722]/50 text-[11px] font-medium text-[#FF7A45]">
            ここから未読
          </span>
          <div className="flex-1 h-px bg-[#FF5722]/40" />
        </div>
      )}

      {/* メッセージ一覧（1メッセージ＝1バブル完全独立表示） */}
      <div className="space-y-4 sm:space-y-6 relative z-10">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            settings={settings}
            onToggleReaction={onToggleReaction}
            onOpenThread={onOpenThread}
            onAddBookmark={onAddBookmark}
            onEditMessage={onEditMessage}
            onDeleteMessage={onDeleteMessage}
            onVoteWorkflow={onVoteWorkflow}
          />
        ))}
      </div>

      {/* タイピングインジケーター */}
      {settings.isTypingVisible && typingUsers.length > 0 && (
        <div className="mt-6 flex items-center gap-2 text-xs text-[#8E8E93] relative z-10">
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF5722] animate-ping" />
            <span className="w-1.5 h-1.5 rounded-full bg-[#EA580C]" />
          </span>
          <span>{typingUsers.join('、')} が入力中...</span>
        </div>
      )}
    </div>
  );
}
