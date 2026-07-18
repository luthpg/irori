'use client';

import { Flame, Menu, MessageSquare, Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAppContext } from '@/hooks/useAppContext';
import { useRoomWebSocket } from '@/hooks/useRoomWebSocket';
import { client } from '@/lib/api';
import { type DbMessage, MessageBubble } from './message-bubble';
import { MessageInput } from './message-input';

interface ChatAreaProps {
  roomId: string;
}

interface RoomInfo {
  id: string;
  name: string;
  isEphemeral: boolean;
  settings: {
    isReadVisible: boolean;
    isTypingVisible: boolean;
    isThreadEnabled: boolean;
    isMentionEnabled: boolean;
  };
}

export function ChatArea({ roomId }: ChatAreaProps) {
  const {
    token,
    user,
    isSidebarOpen,
    setIsSidebarOpen,
    isSettingsOpen,
    setIsSettingsOpen,
  } = useAppContext();

  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const timelineEndRef = useRef<HTMLDivElement | null>(null);

  const getHeaders = () =>
    token ? { Authorization: `Bearer ${token}` } : undefined;

  // ルーム情報と過去メッセージを取得
  const fetchRoomData = async () => {
    try {
      setLoading(true);
      const [roomRes, msgRes] = await Promise.all([
        client.api.v1.rooms[':roomId'].$get(
          { param: { roomId } },
          { headers: getHeaders() }
        ),
        client.api.v1.rooms[':roomId'].messages.$get(
          { param: { roomId }, query: { limit: '50' } },
          { headers: getHeaders() }
        ),
      ]);

      if (roomRes.ok) {
        const roomData = await roomRes.json();
        setRoomInfo(roomData as RoomInfo);
      }

      if (msgRes.ok) {
        const msgData = await msgRes.json();
        setMessages((msgData.messages as DbMessage[]).reverse()); // タイムライン順に並び替え
      }
    } catch (err) {
      console.error('Failed to load chat data:', err);
    } finally {
      setLoading(false);
    }
  };

  // ルーム情報と過去メッセージを取得
  // biome-ignore lint/correctness/useExhaustiveDependencies: fetchRoomData changes on every render. Trigger only on roomId and token.
  useEffect(() => {
    fetchRoomData();
  }, [roomId, token]);

  // 新しいメッセージ受信時に自動スクロール
  // biome-ignore lint/correctness/useExhaustiveDependencies: We trigger scroll specifically when the messages array length or content changes.
  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // WebSocket 連携 (新規投稿、編集、削除、タイピングを購読)
  const { typingUsers, handleUserTyping } = useRoomWebSocket(
    roomId,
    (event) => {
      if (event.type === 'NEW_MESSAGE') {
        const newMsg = event.data as DbMessage;
        setMessages((prev) => {
          // 重複挿入防止
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      } else if (event.type === 'MESSAGE_EDIT') {
        const { id, content } = event.data;
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, content } : m))
        );
      } else if (event.type === 'MESSAGE_DELETE') {
        const { id } = event.data;
        setMessages((prev) => prev.filter((m) => m.id !== id));
      }
    }
  );

  // メッセージの新規投稿
  const handleSendMessage = async (content: string, mediaUrl?: string) => {
    try {
      const res = await client.api.v1.rooms[':roomId'].messages.$post(
        {
          param: { roomId },
          json: { content, mediaUrl },
        },
        { headers: getHeaders() }
      );

      if (res.ok) {
        // API投稿成功後、WebSocketのNEW_MESSAGEイベントが走りタイムラインが自動更新される
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  // メッセージの編集
  const handleEditMessage = async (messageId: string, newContent: string) => {
    try {
      const res = await client.api.v1.messages[':messageId'].$put(
        {
          param: { messageId },
          json: { content: newContent },
        },
        { headers: getHeaders() }
      );
      if (res.ok) {
        // WebSocketのMESSAGE_EDITイベントが走り自動同期される
      }
    } catch (err) {
      console.error('Failed to edit message:', err);
    }
  };

  // メッセージの削除
  const handleDeleteMessage = async (messageId: string) => {
    try {
      const res = await client.api.v1.messages[':messageId'].$delete(
        { param: { messageId } },
        { headers: getHeaders() }
      );
      if (res.ok) {
        // WebSocketのMESSAGE_DELETEイベントが走り自動同期される
      }
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-[#8E8E93] bg-[#0A0A0C]">
        <Flame className="w-8 h-8 animate-spin text-[#FF5722] mb-2" />
        <span>メッセージを読み込み中...</span>
      </div>
    );
  }

  if (!roomInfo || !user) return null;

  // 既読表示トグルのON/OFF状態確認
  const isReadVisible = roomInfo.settings.isReadVisible;
  // タイピング表示トグルのON/OFF状態確認
  const isTypingVisible = roomInfo.settings.isTypingVisible;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0A0C] min-w-0 select-none justify-between">
      {/* 1. ヘッダー */}
      <header className="h-14 border-b border-[#1F1F23] px-4 flex items-center justify-between shrink-0 text-[#F5F5F7]">
        <div className="flex items-center gap-2">
          {/* モバイル時のハンバーガー */}
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="md:hidden p-1 text-[#8E8E93] hover:text-[#F5F5F7] hover:bg-[#1F1F23] rounded transition-colors border-0 cursor-pointer"
            aria-label="ルームリストを表示"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-sm truncate max-w-[200px]">
              {roomInfo.name}
            </span>
            <span className="text-[10px] text-[#8E8E93]">
              メンバーオンライン 23
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 右詳細パネルのトグル */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className={`p-1.5 rounded hover:bg-[#1F1F23] transition-colors border-0 cursor-pointer ${
              isSettingsOpen ? 'text-[#FF5722]' : 'text-[#8E8E93]'
            }`}
            title="ルーム設定・詳細"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 2. サブヘッダー（トグル設定の簡易表示） */}
      <div className="px-4 py-2 border-b border-[#1F1F23]/60 bg-[#131316]/20 flex flex-wrap gap-2 text-[10px] text-[#8E8E93] shrink-0 items-center select-none">
        <span className="mr-1">設定:</span>
        <span
          className={`px-1.5 py-0.5 rounded font-semibold ${
            isReadVisible
              ? 'bg-[#FF5722]/15 text-[#FF5722]'
              : 'bg-[#1F1F23] text-[#8E8E93]'
          }`}
        >
          既読: {isReadVisible ? 'ON' : 'OFF'}
        </span>
        <span
          className={`px-1.5 py-0.5 rounded font-semibold ${
            isTypingVisible
              ? 'bg-[#FF5722]/15 text-[#FF5722]'
              : 'bg-[#1F1F23] text-[#8E8E93]'
          }`}
        >
          タイピング: {isTypingVisible ? 'ON' : 'OFF'}
        </span>
        <span
          className={`px-1.5 py-0.5 rounded font-semibold ${
            roomInfo.settings.isThreadEnabled
              ? 'bg-[#FF5722]/15 text-[#FF5722]'
              : 'bg-[#1F1F23] text-[#8E8E93]'
          }`}
        >
          スレッド: {roomInfo.settings.isThreadEnabled ? 'ON' : 'OFF'}
        </span>
        <span className="px-1.5 py-0.5 rounded bg-[#1F1F23] text-[#8E8E93] font-semibold">
          一時: {roomInfo.isEphemeral ? 'ON' : 'OFF'}
        </span>
      </div>

      {/* 3. タイムラインエリア */}
      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-2">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isAnonymous={false} // 将来的にルーム自体の匿名設定があればそちらと連動
            isAdmin={false} // 管理者判定は rooms 取得で行うが、一旦 false
            onEdit={handleEditMessage}
            onDelete={handleDeleteMessage}
          />
        ))}

        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-[#8E8E93] gap-2">
            <MessageSquare className="w-8 h-8 opacity-40" />
            <span className="text-sm">まだ会話がありません</span>
            <span className="text-xs">
              メッセージを入力して囲炉裏を囲みましょう。
            </span>
          </div>
        )}

        {/* 他ユーザーがタイピング中の気配表示 */}
        {isTypingVisible && typingUsers.length > 0 && (
          <div className="px-4 py-1.5 text-xs text-[#8E8E93] italic flex items-center gap-1.5 animate-pulse">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF5722]" />
            <span>誰かがキーを入力しています...</span>
          </div>
        )}

        <div ref={timelineEndRef} />
      </div>

      {/* 4. メッセージ入力欄 */}
      <MessageInput
        onSend={handleSendMessage}
        onTyping={handleUserTyping}
        placeholder={`${roomInfo.name} にメッセージを送信...`}
      />
    </div>
  );
}
