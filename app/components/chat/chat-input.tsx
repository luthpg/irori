import { useEffect, useRef, useState } from 'react';
import { encryptBinaryForSpace } from '~/lib/crypto/envelope.client';
import { detectMobileOrTablet, resolveEnterKeyAction } from '~/lib/keyboard';
import type {
  EnterKeyBehavior,
  MediaAttachment,
  WorkflowCardData,
} from '~/lib/schemas';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB 上限

interface ChatInputProps {
  spaceId: string;
  channelName: string;
  isAnonymousMode: boolean;
  enterKeyBehavior?: EnterKeyBehavior;
  onEnterKeyBehaviorChange?: (next: EnterKeyBehavior) => void;
  onSendMessage: (payload: {
    content: string;
    deliveryMode: 'instant' | 'when_free';
    media?: MediaAttachment;
    workflow?: WorkflowCardData;
  }) => void;
}

export function ChatInput({
  spaceId,
  channelName,
  isAnonymousMode,
  enterKeyBehavior = 'newline',
  onEnterKeyBehaviorChange,
  onSendMessage,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<'instant' | 'when_free'>(
    'instant',
  );
  const [attachedMedia, setAttachedMedia] = useState<MediaAttachment | null>(
    null,
  );
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [showWorkflowMenu, setShowWorkflowMenu] = useState(false);
  const [isMobileOrTablet, setIsMobileOrTablet] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isComposingRef = useRef(false);
  const lastCompositionEndMsRef = useRef(0);

  useEffect(() => {
    setIsMobileOrTablet(detectMobileOrTablet());
  }, []);

  const syncTextareaHeight = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_BYTES) {
      setUploadStatus('ファイルサイズは最大 5MB までです');
      e.target.value = '';
      return;
    }

    setUploadStatus('画像をアップロード中...');
    try {
      const plainBuf = await file.arrayBuffer();
      const { encryptedBuffer, iv } = await encryptBinaryForSpace(
        plainBuf,
        spaceId,
        1,
      );
      const r2Key = `media-${spaceId}-${Date.now().toString(36)}`;
      const res = await fetch(`/api/media/${r2Key}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Irori-Original-Type': file.type || 'image/png',
          'X-Irori-Iv': iv,
          'X-Irori-Space-Id': spaceId,
        },
        body: encryptedBuffer,
      });

      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      if (res.ok) {
        setAttachedMedia({
          provider: '添付画像',
          title: file.name,
          subtitle: `${sizeMb} MB`,
          thumbnailType: 'campfire',
          r2Key,
          iv,
        });
        setUploadStatus(null);
      } else {
        setUploadStatus('画像のアップロードに失敗しました');
      }
    } catch {
      setUploadStatus('アップロード処理中にエラーが発生しました');
    } finally {
      e.target.value = '';
    }
  };

  const submitCurrentMessage = () => {
    if (!text.trim() && !attachedMedia) return;

    onSendMessage({
      content: text.trim() || '画像を共有しました',
      deliveryMode,
      media: attachedMedia ?? undefined,
    });
    setText('');
    setAttachedMedia(null);
    setUploadStatus(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitCurrentMessage();
  };

  const handleTextareaKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
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
      submitCurrentMessage();
      return;
    }

    if (action === 'newline_manual') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart ?? text.length;
      const end = target.selectionEnd ?? text.length;
      const nextText = `${text.slice(0, start)}\n${text.slice(end)}`;
      setText(nextText);
      window.requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = start + 1;
          textareaRef.current.selectionEnd = start + 1;
          syncTextareaHeight(textareaRef.current);
        }
      });
    }
  };

  const handleInsertWorkflow = (type: 'schedule' | 'focus_timer') => {
    if (type === 'schedule') {
      onSendMessage({
        content:
          '集まりの候補を作成しました。都合の良い日時を選択してください。',
        deliveryMode,
        workflow: {
          type: 'schedule',
          title: '📅 日程調整',
          options: [
            {
              id: `wf-${Date.now()}-1`,
              label: '金曜 21:00〜',
              yesCount: 1,
              maybeCount: 0,
              noCount: 0,
              myVote: 'yes',
            },
            {
              id: `wf-${Date.now()}-2`,
              label: '土曜 21:00〜',
              yesCount: 1,
              maybeCount: 0,
              noCount: 0,
              myVote: 'yes',
            },
          ],
        },
      });
    } else {
      onSendMessage({
        content:
          '25分間のフォーカスタイマーを開始しました。集中して取り組みましょう！',
        deliveryMode,
        workflow: {
          type: 'focus_timer',
          title: '⏱ フォーカスタイマー（25分集中 ＋ 5分休憩）',
          timerMinutes: 25,
        },
      });
    }
    setShowWorkflowMenu(false);
  };

  return (
    <div className="shrink-0 px-3 pb-3 pt-2 sm:px-5 sm:pb-4 bg-[#0D0D10] border-t border-[#1F1F24] relative z-20">
      {/* 添付プレビューまたは気配連動配信・Enterキー挙動ステータスバー */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 mb-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* FR-CHAT-08: 相手が「ひま」になったら届ける気配連動配信トグル */}
          <button
            type="button"
            onClick={() =>
              setDeliveryMode((prev) =>
                prev === 'instant' ? 'when_free' : 'instant',
              )
            }
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors flex items-center gap-1.5 ${
              deliveryMode === 'when_free'
                ? 'bg-[#261712] border-[#22C55E]/50 text-[#22C55E]'
                : 'bg-[#18181C] border-white/[0.06] text-[#8E8E93] hover:text-[#F5F5F7]'
            }`}
          >
            <span>{deliveryMode === 'when_free' ? '🟢' : '🕒'}</span>
            <span className="hidden sm:inline">
              {deliveryMode === 'when_free'
                ? '相手のオンライン時に送信（送信待機）'
                : '即時送信'}
            </span>
            <span className="sm:hidden">
              {deliveryMode === 'when_free' ? '在室時に送信' : '即時'}
            </span>
          </button>

          {isAnonymousMode && (
            <span className="px-2.5 py-1 rounded-full bg-[#1F1F24] border border-white/10 text-[11px] text-[#D4D4D8]">
              🎭 匿名
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* PC向け Enterキー挙動インジケーター＆クイック切替（モバイル・タブレットは改行固定） */}
          {!isMobileOrTablet ? (
            <button
              type="button"
              onClick={() =>
                onEnterKeyBehaviorChange?.(
                  enterKeyBehavior === 'newline' ? 'send' : 'newline',
                )
              }
              title="クリックで単品Enterの動作（改行 / 送信）を切り替え（設定画面とも連動）"
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#18181C] hover:bg-[#1F1F24] border border-white/[0.06] text-[11px] text-[#8E8E93] hover:text-[#F5F5F7] transition-colors"
            >
              <span>⌨️</span>
              <span>
                {enterKeyBehavior === 'newline'
                  ? 'Enter: 改行 / Alt・Shift+Enter: 送信'
                  : 'Enter: 送信 / Alt・Shift+Enter: 改行'}
              </span>
            </button>
          ) : null}

          {uploadStatus && (
            <span className="text-[11px] text-[#FF7A45] font-mono">
              {uploadStatus}
            </span>
          )}

          {attachedMedia && (
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#261712] border border-[#FF5722]/40 text-[11px] text-[#FF7A45]">
              <span>📎 {attachedMedia.title}</span>
              <button
                type="button"
                onClick={() => setAttachedMedia(null)}
                className="hover:text-white font-bold"
              >
                ×
              </button>
            </div>
          )}
        </div>
      </div>

      {/* コンプ画像準拠のマルチライン対応入力フォーム */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2 sm:gap-3">
        <div className="flex-1 flex items-end bg-[#18181C] border border-white/[0.08] focus-within:border-[#FF5722]/60 rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 transition-colors relative">
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              syncTextareaHeight(e.currentTarget);
            }}
            onCompositionStart={() => {
              isComposingRef.current = true;
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false;
              lastCompositionEndMsRef.current = Date.now();
            }}
            onKeyDown={handleTextareaKeyDown}
            placeholder={`${channelName} にメッセージを送信...`}
            className="flex-1 bg-transparent text-base text-[#F5F5F7] placeholder:text-[#8E8E93] focus:outline-none min-w-0 resize-none max-h-36 leading-relaxed"
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="flex items-center gap-1.5 sm:gap-2 ml-1.5 sm:ml-2 shrink-0">
            {/* ⚡ ノーコード・クイックワークフロー呼び出し */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowWorkflowMenu((prev) => !prev)}
                title="クイックワークフロー（日程調整・フォーカスタイマー）を挿入"
                className="p-1.5 rounded-lg text-[#8E8E93] hover:text-[#FF7A45] hover:bg-[#1F1F24] transition-colors text-sm"
              >
                ⚡
              </button>

              {showWorkflowMenu && (
                <div className="absolute right-0 bottom-11 z-40 w-64 rounded-xl bg-[#1F1F24] border border-white/10 p-2.5 shadow-2xl space-y-1.5">
                  <div className="text-[11px] font-semibold text-[#8E8E93] px-1">
                    ワークフローを挿入
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInsertWorkflow('schedule')}
                    className="w-full text-left p-2 rounded-lg bg-[#18181C] hover:bg-[#261712] border border-white/[0.05] text-xs text-[#F5F5F7] transition-colors"
                  >
                    📅 日程調整
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertWorkflow('focus_timer')}
                    className="w-full text-left p-2 rounded-lg bg-[#18181C] hover:bg-[#261712] border border-white/[0.05] text-xs text-[#F5F5F7] transition-colors"
                  >
                    ⏱ フォーカスタイマー (25分)
                  </button>
                </div>
              )}
            </div>

            {/* クリップアイコン（画像添付・5MB制限） */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="画像を添付（5MB以下）"
              className={`p-1.5 rounded-lg transition-colors ${
                attachedMedia
                  ? 'bg-[#261712] text-[#FF5722]'
                  : 'text-[#EA580C] hover:text-[#FF7A45] hover:bg-[#1F1F24]'
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* 送信ボタン */}
        <button
          type="submit"
          title="送信"
          className={`w-11 h-11 rounded-xl border flex items-center justify-center transition-all shrink-0 ${
            text.trim().length > 0
              ? 'bg-[#FF5722] hover:bg-[#EA580C] border-[#FF5722] text-white shadow-[0_0_12px_rgba(255,87,34,0.35)]'
              : 'bg-[#18181C] hover:bg-[#261712] border-white/[0.08] hover:border-[#FF5722]/50 text-[#8E8E93]'
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            className="w-5 h-5 fill-current"
            aria-hidden="true"
          >
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </form>
    </div>
  );
}
