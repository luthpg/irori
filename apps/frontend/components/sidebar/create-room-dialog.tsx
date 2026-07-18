'use client';

import { Flame, X } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useAppContext } from '@/hooks/useAppContext';
import { client } from '@/lib/api';

export function CreateRoomDialog({ onClose }: { onClose: () => void }) {
  const { token, refreshRooms, setActiveRoomId } = useAppContext();
  const [name, setName] = useState('');
  const [isEphemeral, setIsEphemeral] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const getHeaders = () =>
    token ? { Authorization: `Bearer ${token}` } : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setSubmitting(true);
      setError(null);
      const res = await client.api.v1.rooms.$post(
        { json: { name: name.trim(), isEphemeral } },
        { headers: getHeaders() }
      );

      if (res.ok) {
        const data = await res.json();
        await refreshRooms();
        setActiveRoomId(data.id);
        onClose();
      } else {
        const errData = await res.json();
        setError(errData.error || 'ルームの作成に失敗しました');
      }
    } catch (_err) {
      setError('通信エラーが発生しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A0A0C]/80 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-sm bg-[#18181C] border border-[#1F1F23] rounded-md shadow-2xl overflow-hidden">
        {/* モーダルヘッダー */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1F1F23] text-[#F5F5F7]">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-[#FF5722]" />
            <span className="font-bold">新しい囲炉裏を作成</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-[#1F1F23] transition-colors border-0 text-[#8E8E93] hover:text-[#F5F5F7] cursor-pointer"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* フォームボディ */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="room-name"
              className="text-xs text-[#8E8E93] font-semibold"
            >
              ルーム名
            </label>
            <input
              type="text"
              id="room-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: たき火を囲む雑談"
              className="w-full h-11 rounded bg-[#131316] border border-[#1F1F23] text-sm text-[#F5F5F7] px-3 placeholder-[#8E8E93]/60 focus:outline-none focus:border-[#FF5722] text-base"
              style={{ fontSize: '16px' }} // iOSキーボードズームバグ防止の強制16px
              disabled={submitting}
            />
          </div>

          {/* 一時モードトグル */}
          <div className="flex items-start gap-3 bg-[#131316]/50 border border-[#1F1F23]/60 p-3.5 rounded-md">
            <input
              type="checkbox"
              id="is-ephemeral"
              checked={isEphemeral}
              onChange={(e) => setIsEphemeral(e.target.checked)}
              className="w-4.5 h-4.5 rounded border-[#1F1F23] text-[#FF5722] focus:ring-[#FF5722] focus:ring-offset-0 bg-[#131316] mt-0.5 cursor-pointer accent-[#FF5722]"
              disabled={submitting}
            />
            <div className="flex flex-col gap-1">
              <label
                htmlFor="is-ephemeral"
                className="text-sm font-semibold text-[#F5F5F7] cursor-pointer"
              >
                一時チャットモードにする (24 時間)
              </label>
              <span className="text-xs text-[#8E8E93] leading-relaxed">
                ON の場合、投稿されたすべてのメッセージは 24
                時間で自動消滅します。この設定は作成後に変更できません。
              </span>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-950/20 px-3 py-2 rounded border border-red-900/30">
              {error}
            </p>
          )}

          {/* フッターアクション */}
          <div className="flex gap-3 justify-end mt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded bg-transparent border border-[#1F1F23] text-sm text-[#8E8E93] hover:text-[#F5F5F7] hover:bg-[#131316] transition-colors cursor-pointer"
              disabled={submitting}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="h-10 px-4 rounded bg-[#FF5722] text-white text-sm font-semibold hover:bg-[#E64A19] transition-colors border-0 cursor-pointer flex items-center justify-center"
              disabled={submitting || !name.trim()}
            >
              {submitting ? '作成中...' : '作成する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
