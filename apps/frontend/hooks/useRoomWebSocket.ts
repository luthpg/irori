import { useCallback, useEffect, useRef, useState } from 'react';
import { env } from '@/env';
import { useAppContext } from './useAppContext';

interface WebSocketEvent {
  type: 'NEW_MESSAGE' | 'MESSAGE_EDIT' | 'MESSAGE_DELETE' | 'USER_TYPING';
  // biome-ignore lint/suspicious/noExplicitAny: WebSocket events send heterogeneous payload structures
  data: any;
}

export function useRoomWebSocket(
  roomId: string | null,
  onMessageEvent: (event: WebSocketEvent) => void
) {
  const { user } = useAppContext();
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!roomId || !user) {
      setConnected(false);
      setTypingUsers({});
      return;
    }

    const apiBaseUrl = env.NEXT_PUBLIC_API_BASE_URL;
    // http を ws、https を wss に置き換える
    const wsBaseUrl = apiBaseUrl.replace(/^http/, 'ws');
    const wsUrl = `${wsBaseUrl}/ws/rooms/${roomId}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const payload: WebSocketEvent = JSON.parse(event.data);
        if (payload.type === 'USER_TYPING') {
          const { userId, isTyping } = payload.data;
          // 自分自身のタイピングステータスは表示対象から除外
          if (userId !== user.id) {
            setTypingUsers((prev) => ({
              ...prev,
              [userId]: isTyping,
            }));
          }
        } else {
          onMessageEvent(payload);
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setTypingUsers({});
    };

    ws.onerror = (err) => {
      console.error('WebSocket Error:', err);
    };

    return () => {
      ws.close();
      wsRef.current = null;
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [roomId, user, onMessageEvent]);

  // タイピング開始イベントを通知
  const sendTypingStart = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !user)
      return;

    wsRef.current.send(
      JSON.stringify({
        type: 'TYPING_START',
        userId: user.id,
      })
    );
  }, [user]);

  // タイピング終了イベントを通知
  const sendTypingStop = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !user)
      return;

    wsRef.current.send(
      JSON.stringify({
        type: 'TYPING_STOP',
        userId: user.id,
      })
    );
  }, [user]);

  // ユーザーの入力検知ハンドラー
  const handleUserTyping = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    } else {
      // 最初の入力があった際に開始を送信
      sendTypingStart();
    }

    // 2.5秒間連続して入力がない場合は停止と見なす
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingStop();
      typingTimeoutRef.current = null;
    }, 2500);
  }, [sendTypingStart, sendTypingStop]);

  return {
    connected,
    typingUsers: Object.entries(typingUsers)
      .filter(([_, isTyping]) => isTyping)
      .map(([userId]) => userId),
    handleUserTyping,
  };
}
