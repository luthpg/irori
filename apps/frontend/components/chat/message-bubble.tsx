'use client';

import type { messages } from 'backend/src/db/schema';
import { Edit2, Trash2 } from 'lucide-react';
import Image from 'next/image';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useAppContext } from '@/hooks/useAppContext';
import { client } from '@/lib/api';

export type DbMessage = typeof messages.$inferSelect;

interface MessageBubbleProps {
  message: DbMessage;
  isAnonymous: boolean;
  isAdmin: boolean;
  onEdit: (messageId: string, newContent: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
}

// プレビュー情報インターフェース
interface PreviewMetadata {
  previewUrl: string;
  width?: number;
  height?: number;
  mimeType?: string;
  title?: string;
}

export function MessageBubble({
  message,
  isAnonymous,
  isAdmin,
  onEdit,
  onDelete,
}: MessageBubbleProps) {
  const { user, token } = useAppContext();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [preview, setPreview] = useState<PreviewMetadata | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const isOwnMessage = user ? message.userId === user.id : false;
  const canDelete = isOwnMessage || isAdmin;

  // Google Drive のプレビューを非同期で取得
  useEffect(() => {
    const fetchMediaPreview = async () => {
      const urlToTest = message.mediaUrl || message.content;
      const isDriveUrl =
        urlToTest?.includes('drive.google.com') ||
        urlToTest?.includes('docs.google.com');

      if (!isDriveUrl) return;

      try {
        setLoadingPreview(true);
        const headers = token
          ? { Authorization: `Bearer ${token}` }
          : undefined;
        const res = await client.api.v1.media.preview.$post(
          { json: { url: urlToTest } },
          { headers }
        );
        if (res.ok) {
          const data = await res.json();
          setPreview(data as PreviewMetadata);
        }
      } catch (err) {
        console.error('Failed to load OGP preview:', err);
      } finally {
        setLoadingPreview(false);
      }
    };

    fetchMediaPreview();
  }, [message.content, message.mediaUrl, token]);

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editContent.trim() || editContent === message.content) {
      setIsEditing(false);
      return;
    }
    await onEdit(message.id, editContent.trim());
    setIsEditing(false);
  };

  // タイムスタンプフォーマット (例: 17:06)
  const formatTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex gap-3 px-4 py-2 group hover:bg-[#131316]/20 transition-colors rounded-md text-sm select-none items-start">
      {/* 左アバター */}
      <div className="shrink-0">
        {isAnonymous ? (
          // 匿名用お面アイコン
          <div className="w-10 h-10 rounded-full bg-[#1F1F23] flex items-center justify-center text-lg text-[#F5F5F7]">
            🎭
          </div>
        ) : (
          // 通常用イニシャルアバター
          <div className="w-10 h-10 rounded-full bg-[#FF5722]/10 border border-[#FF5722]/20 flex items-center justify-center text-sm font-bold text-[#FF5722]">
            {message.userId ? message.userId.slice(-2).toUpperCase() : 'SYS'}
          </div>
        )}
      </div>

      {/* メッセージ本体 */}
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        {/* 送信者情報 */}
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#F5F5F7]">
            {isAnonymous
              ? '匿名'
              : message.userId
                ? `ユーザー_${message.userId.slice(-4)}`
                : 'Irori Bot'}
          </span>
          <span className="text-xs text-[#8E8E93]">
            {formatTime(message.createdAt)}
          </span>
        </div>

        {/* メッセージコンテンツエリア */}
        {isEditing ? (
          <form onSubmit={handleEditSubmit} className="flex gap-2 mt-1">
            <input
              type="text"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="flex-1 h-9 rounded bg-[#18181C] border border-[#1F1F23] text-sm text-[#F5F5F7] px-3 focus:outline-none focus:border-[#FF5722] text-base"
              style={{ fontSize: '16px' }} // iOSズームバグ対策
              // biome-ignore lint/a11y/noAutofocus: autofocus is required here for smooth inline editing UX
              autoFocus
            />
            <button
              type="submit"
              className="h-9 px-3 rounded bg-[#FF5722] text-white text-xs font-semibold cursor-pointer border-0"
            >
              保存
            </button>
            <button
              type="button"
              onClick={() => {
                setEditContent(message.content);
                setIsEditing(false);
              }}
              className="h-9 px-3 rounded bg-[#1F1F23] text-[#8E8E93] text-xs font-semibold hover:text-[#F5F5F7] cursor-pointer border-0"
            >
              キャンセル
            </button>
          </form>
        ) : (
          <div className="text-[#F5F5F7] leading-relaxed break-words whitespace-pre-wrap">
            {message.content}
          </div>
        )}

        {/* OGPプレビュー */}
        {preview && (
          <div className="mt-2 flex border border-[#1F1F23] bg-[#131316] rounded-md overflow-hidden max-w-lg cursor-pointer hover:border-[#FF5722]/50 transition-colors">
            {preview.previewUrl && (
              <Image
                src={preview.previewUrl}
                alt="サムネイルプレビュー"
                className="w-24 h-24 object-cover shrink-0 border-r border-[#1F1F23]"
              />
            )}
            <div className="p-3 flex flex-col justify-center min-w-0">
              <span className="text-xs text-[#FF5722] font-bold tracking-wider">
                GOOGLE DRIVE PREVIEW
              </span>
              <span className="text-sm font-semibold text-[#F5F5F7] truncate mt-1">
                {preview.title || 'Google Drive File'}
              </span>
              <span className="text-xs text-[#8E8E93] truncate mt-0.5">
                詳細プレビュー画像付きファイル
              </span>
            </div>
          </div>
        )}

        {loadingPreview && (
          <div className="text-xs text-[#8E8E93] mt-1 animate-pulse">
            プレビューを読み込み中...
          </div>
        )}
      </div>

      {/* ホバー時のアクションメニュー */}
      {!isEditing && (canDelete || isOwnMessage) && (
        <div className="hidden group-hover:flex items-center gap-1 bg-[#18181C] border border-[#1F1F23] rounded p-1 shadow-md shrink-0">
          {isOwnMessage && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="p-1 rounded text-[#8E8E93] hover:text-[#F5F5F7] hover:bg-[#1F1F23] transition-colors border-0 cursor-pointer"
              title="メッセージを編集"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(message.id)}
              className="p-1 rounded text-[#8E8E93] hover:text-[#FF3B30] hover:bg-[#1F1F23] transition-colors border-0 cursor-pointer"
              title="メッセージを削除"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
