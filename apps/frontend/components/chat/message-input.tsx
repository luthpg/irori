'use client';

import { Paperclip, Send, X } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

interface MessageInputProps {
  onSend: (content: string, mediaUrl?: string) => Promise<void>;
  onTyping: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export function MessageInput({
  onSend,
  onTyping,
  placeholder,
  disabled,
}: MessageInputProps) {
  const [content, setContent] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [showMediaInput, setShowMediaInput] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    if (!content.trim() && !mediaUrl.trim()) return;

    await onSend(content.trim(), mediaUrl.trim() || undefined);
    setContent('');
    setMediaUrl('');
    setShowMediaInput(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setContent(e.target.value);
    onTyping(); // 入力開始・継続を親フックに伝える
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="p-4 bg-[#0A0A0C] border-t border-[#1F1F23] flex flex-col gap-2 shrink-0 select-none"
    >
      {/* 添付ファイル/共有URL貼り付けパネル */}
      {showMediaInput && (
        <div className="flex items-center gap-2 bg-[#131316] border border-[#1F1F23] rounded-md px-3 py-1.5 animate-duration-150">
          <Paperclip className="w-4 h-4 text-[#FF5722]" />
          <input
            type="text"
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            placeholder="Google Drive などの共有 URL を入力..."
            className="flex-1 bg-transparent text-xs text-[#F5F5F7] focus:outline-none placeholder-[#8E8E93]/60 text-base"
            style={{ fontSize: '16px' }} // iOSズームバグ対策
            disabled={disabled}
          />
          <button
            type="button"
            onClick={() => {
              setMediaUrl('');
              setShowMediaInput(false);
            }}
            className="p-1 hover:text-[#FF3B30] text-[#8E8E93] transition-colors border-0 cursor-pointer"
            title="取り消し"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* メイン入力フォーム */}
      <div className="flex items-center gap-3 bg-[#131316] border border-[#1F1F23] rounded-md px-4 py-2 hover:border-[#1F1F23]/80 transition-colors">
        {/* メディアインプットのトグル */}
        <button
          type="button"
          onClick={() => setShowMediaInput(!showMediaInput)}
          className={`p-1 rounded hover:bg-[#1F1F23] transition-colors border-0 cursor-pointer ${
            showMediaInput || mediaUrl ? 'text-[#FF5722]' : 'text-[#8E8E93]'
          }`}
          title="共有リンクを添付"
          disabled={disabled}
        >
          <Paperclip className="w-5 h-5" />
        </button>

        {/* テキスト入力 */}
        <input
          type="text"
          value={content}
          onChange={handleInputChange}
          placeholder={placeholder || 'メッセージを入力...'}
          className="flex-1 bg-transparent text-sm text-[#F5F5F7] focus:outline-none placeholder-[#8E8E93]/60 text-base"
          style={{ fontSize: '16px' }} // iOSズームバグ対策
          disabled={disabled}
        />

        {/* 送信ボタン */}
        <button
          type="submit"
          disabled={disabled || (!content.trim() && !mediaUrl.trim())}
          className="p-1.5 rounded-full text-[#8E8E93] hover:text-white hover:bg-[#FF5722] transition-colors border-0 cursor-pointer disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#8E8E93]"
          aria-label="送信"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
}
