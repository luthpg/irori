import { useEffect, useRef, useState } from 'react';
import { MemberAvatar } from '~/components/ui/irori-icons';
import { detectMobileOrTablet, resolveEnterKeyAction } from '~/lib/keyboard';
import type {
  EnterKeyBehavior,
  MockBookmark,
  MockMessage,
  MockThreadReply,
} from '~/lib/schemas';

interface ThreadDrawerProps {
  isOpen: boolean;
  activeTab: 'thread' | 'bookmarks';
  onTabChange: (tab: 'thread' | 'bookmarks') => void;
  onClose: () => void;
  parentMessage: MockMessage | null;
  threadReplies: MockThreadReply[];
  onSendThreadReply: (content: string) => void;
  bookmarks: MockBookmark[];
  onUpdateBookmarkNote: (bookmarkId: string, note: string) => void;
  onDeleteBookmark: (bookmarkId: string) => void;
  enterKeyBehavior?: EnterKeyBehavior;
}

/**
 * plan.components.md 3.3: ThreadDrawer (Context Drawer 340px)
 * 右ペイン展開型スレッド詳細、および個人用二重隔離ブックマーク＆非公開メモペイン。
 */
export function ThreadDrawer({
  isOpen,
  activeTab,
  onTabChange,
  onClose,
  parentMessage,
  threadReplies,
  onSendThreadReply,
  bookmarks,
  onUpdateBookmarkNote,
  onDeleteBookmark,
  enterKeyBehavior = 'newline',
}: ThreadDrawerProps) {
  const [replyText, setReplyText] = useState('');
  const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(
    null,
  );
  const [noteDraft, setNoteDraft] = useState('');
  const [isMobileOrTablet, setIsMobileOrTablet] = useState(false);
  const replyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isComposingRef = useRef(false);
  const lastCompositionEndMsRef = useRef(0);

  useEffect(() => {
    setIsMobileOrTablet(detectMobileOrTablet());
  }, []);

  if (!isOpen) return null;

  const submitThreadReply = () => {
    if (!replyText.trim()) return;
    onSendThreadReply(replyText.trim());
    setReplyText('');
  };

  const handleReplySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitThreadReply();
  };

  const handleReplyKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const nativeEvt = e.nativeEvent as KeyboardEvent & {
      keyCode?: number;
      which?: number;
    };

    const action = resolveEnterKeyAction({
      key: e.key,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      isComposing: Boolean(nativeEvt.isComposing || isComposingRef.current),
      justEndedComposition: Date.now() - lastCompositionEndMsRef.current < 50,
      keyCode: nativeEvt.keyCode,
      which: nativeEvt.which,
      isMobileOrTablet,
      enterKeyBehavior,
    });

    if (action === 'send') {
      e.preventDefault();
      submitThreadReply();
      return;
    }

    if (action === 'newline_manual') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart ?? replyText.length;
      const end = target.selectionEnd ?? replyText.length;
      const next = `${replyText.slice(0, start)}\n${replyText.slice(end)}`;
      setReplyText(next);
      window.requestAnimationFrame(() => {
        if (replyTextareaRef.current) {
          replyTextareaRef.current.selectionStart = start + 1;
          replyTextareaRef.current.selectionEnd = start + 1;
        }
      });
    }
  };

  return (
    <aside
      aria-label="コンテキストドロワー（スレッド・個人ブックマーク）"
      className="fixed inset-0 z-40 bg-[#131316] md:relative md:inset-auto md:w-[340px] md:border-l md:border-[#1F1F24] shrink-0 flex flex-col justify-between select-none h-full shadow-2xl md:shadow-none animate-in fade-in duration-200"
    >
      {/* ドロワーヘッダー ＆ タブ切替 */}
      <div className="p-3.5 border-b border-[#1F1F24] bg-[#0D0D10]/80">
        <div className="flex items-center justify-between mb-2.5 gap-2">
          <div className="flex items-center gap-1.5 bg-[#0D0D10] p-1 rounded-xl border border-white/[0.06] flex-1 sm:flex-initial">
            <button
              type="button"
              onClick={() => onTabChange('thread')}
              className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'thread'
                  ? 'bg-[#261712] text-[#FF7A45] border border-[#FF5722]/30'
                  : 'text-[#8E8E93] hover:text-[#F5F5F7]'
              }`}
            >
              💬 スレッド詳細
            </button>
            <button
              type="button"
              onClick={() => onTabChange('bookmarks')}
              className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'bookmarks'
                  ? 'bg-[#261712] text-[#FF7A45] border border-[#FF5722]/30'
                  : 'text-[#8E8E93] hover:text-[#F5F5F7]'
              }`}
            >
              🔖 メモ ({bookmarks.length})
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            title="閉じる"
            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl bg-[#18181C] hover:bg-[#1F1F24] border border-white/[0.06] text-[#8E8E93] hover:text-[#F5F5F7] transition-colors text-sm font-semibold"
          >
            ✕
          </button>
        </div>

        <p className="text-[11px] text-[#8E8E93]">
          {activeTab === 'thread'
            ? '特定の話題について返信できます。'
            : '自分専用の非公開メモです（他のメンバーには表示されません）。'}
        </p>
      </div>

      {/* コンテンツ領域 */}
      {activeTab === 'thread' ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {parentMessage ? (
              <>
                {/* 親メッセージ */}
                <div className="p-3 rounded-xl bg-[#18181C] border border-[#FF5722]/30">
                  <div className="flex items-center gap-2 mb-1.5">
                    <MemberAvatar
                      avatarType={parentMessage.avatarType}
                      statusLamp={parentMessage.statusLamp}
                      size="sm"
                    />
                    <span className="text-xs font-bold text-[#F5F5F7]">
                      {parentMessage.senderName}
                    </span>
                    <span className="text-[11px] text-[#8E8E93] font-mono">
                      {parentMessage.timestamp}
                    </span>
                  </div>
                  <p className="text-sm text-[#F5F5F7] budoux-text whitespace-pre-wrap">
                    {parentMessage.content}
                  </p>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-[#8E8E93]">
                  <span>スレッド返信 ({threadReplies.length}件)</span>
                  <div className="flex-1 h-px bg-[#1F1F24]" />
                </div>

                {/* 返信一覧 */}
                <div className="space-y-3">
                  {threadReplies.map((reply) => (
                    <div
                      key={reply.id}
                      className={`p-3 rounded-xl border ${
                        reply.isOwn
                          ? 'bg-[#261712] border-[#FF5722]/30 ml-4'
                          : 'bg-[#18181C] border-white/[0.06] mr-4'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-[#F5F5F7]">
                          {reply.senderName}
                        </span>
                        <span className="text-[10px] text-[#8E8E93] font-mono">
                          {reply.timestamp}
                        </span>
                      </div>
                      <p className="text-xs text-[#F5F5F7] budoux-text leading-relaxed whitespace-pre-wrap">
                        {reply.content}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-xs text-[#8E8E93]">
                メッセージの「💬
                スレッド」ボタンを押すと、ここに会話が表示されます。
              </div>
            )}
          </div>

          {/* スレッド返信入力欄 */}
          {parentMessage && (
            <form
              onSubmit={handleReplySubmit}
              className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-[#1F1F24] bg-[#0D0D10] flex items-end gap-2"
            >
              <textarea
                ref={replyTextareaRef}
                rows={1}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onCompositionStart={() => {
                  isComposingRef.current = true;
                }}
                onCompositionEnd={() => {
                  isComposingRef.current = false;
                  lastCompositionEndMsRef.current = Date.now();
                }}
                onKeyDown={handleReplyKeyDown}
                placeholder="スレッドに返信..."
                className="flex-1 bg-[#18181C] border border-white/10 rounded-xl px-3 py-2 text-sm sm:text-xs text-[#F5F5F7] placeholder:text-[#636366] resize-none max-h-28 leading-relaxed focus:outline-none focus:border-[#FF5722]/50"
              />
              <button
                type="submit"
                className="min-h-[38px] px-3.5 py-2 rounded-xl bg-[#EA580C] hover:bg-[#FF5722] text-white text-xs font-semibold shrink-0 transition-colors"
              >
                返信
              </button>
            </form>
          )}
        </div>
      ) : (
        /* 個人ブックマーク ＆ プライベートメモ一覧 */
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="p-2.5 rounded-xl bg-[#261712]/60 border border-[#FF5722]/30 text-[11px] text-[#FF7A45]">
            🔒
            自分専用の非公開メモです。他のメンバーや管理者には表示されません。
          </div>

          {bookmarks.map((bm) => {
            const isEditing = editingBookmarkId === bm.id;
            return (
              <div
                key={bm.id}
                className="p-3 rounded-xl bg-[#18181C] border border-white/[0.06] space-y-2"
              >
                <div className="flex items-center justify-between text-[11px] text-[#8E8E93]">
                  <span>
                    {bm.channelName} · {bm.senderName}
                  </span>
                  <span>{bm.createdAt}</span>
                </div>

                <div className="p-2 rounded-lg bg-[#131316] border border-white/[0.04] text-xs text-[#D4D4D8] truncate">
                  「{bm.messageExcerpt}」
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg bg-[#0D0D10] border border-[#FF5722]/50 p-2 text-xs text-[#F5F5F7]"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditingBookmarkId(null)}
                        className="px-2 py-1 rounded bg-[#1F1F24] text-[11px] text-[#8E8E93]"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onUpdateBookmarkNote(bm.id, noteDraft);
                          setEditingBookmarkId(null);
                        }}
                        className="px-2.5 py-1 rounded bg-[#FF5722] text-white text-[11px] font-medium"
                      >
                        暗号化保存
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[#F5F5F7] leading-relaxed bg-[#261712]/40 border border-[#FF5722]/20 rounded-lg p-2">
                    📝 {bm.privateNote}
                  </p>
                )}

                <div className="flex items-center justify-between pt-1">
                  <div className="flex flex-wrap gap-1">
                    {bm.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 rounded bg-[#1F1F24] text-[10px] text-[#8E8E93]"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-[#8E8E93]">
                    <button
                      type="button"
                      onClick={() => {
                        setNoteDraft(bm.privateNote);
                        setEditingBookmarkId(bm.id);
                      }}
                      className="hover:text-[#F5F5F7]"
                    >
                      メモ編集
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteBookmark(bm.id)}
                      className="hover:text-[#EF4444]"
                    >
                      削除
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
