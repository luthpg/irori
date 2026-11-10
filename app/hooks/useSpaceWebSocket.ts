import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ClientToServerWsEvent,
  ServerToClientWsEvent,
} from '~/lib/schemas';

interface UseSpaceWebSocketOptions {
  spaceId: string;
  channelId: string;
  memberId: string;
  baseHeatLevel: number;
  isTypingVisible: boolean;
  onServerEvent?: (event: ServerToClientWsEvent) => void;
}

interface UseSpaceWebSocketReturn {
  isConnected: boolean;
  heatLevel: number;
  typingUsers: string[];
  sendWsEvent: (event: ClientToServerWsEvent) => void;
  setManualHeatBoost: (boost: number) => void;
}

/**
 * plan.api.md 4: SpaceActor との Hibernatable WebSocket リアルタイム接続フック
 * `/ws/spaces/:spaceId` へ接続し、新着暗号文メッセージ、リアクション、空気感トグル、在室気配を購読する。
 */
export function useSpaceWebSocket({
  spaceId,
  channelId,
  memberId,
  baseHeatLevel,
  isTypingVisible,
  onServerEvent,
}: UseSpaceWebSocketOptions): UseSpaceWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [heatLevel, setHeatLevel] = useState(baseHeatLevel);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const onServerEventRef = useRef(onServerEvent);

  useEffect(() => {
    onServerEventRef.current = onServerEvent;
  }, [onServerEvent]);

  useEffect(() => {
    setHeatLevel(baseHeatLevel);
  }, [baseHeatLevel]);

  // SpaceActor WebSocket 接続確立
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/spaces/${spaceId}`;

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        ws?.send(
          JSON.stringify({
            type: 'PRESENCE_PING',
            channelId,
            memberId,
          } satisfies ClientToServerWsEvent),
        );
      };

      ws.onmessage = (msgEvent) => {
        try {
          const parsed = JSON.parse(
            String(msgEvent.data),
          ) as ServerToClientWsEvent;
          if (
            parsed.type === 'PRESENCE_STATE' &&
            parsed.data.channelId === channelId
          ) {
            setHeatLevel(parsed.data.heatLevel);
            if (isTypingVisible) {
              setTypingUsers(parsed.data.typingUsers);
            }
          }
          onServerEventRef.current?.(parsed);
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
      };
    } catch {
      setIsConnected(false);
    }

    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      wsRef.current = null;
    };
  }, [spaceId, channelId, memberId, isTypingVisible]);

  // 炭火の呼吸のように微細にゆらぐアンビエント熱量
  useEffect(() => {
    const timer = window.setInterval(() => {
      setHeatLevel((prev) => {
        const delta = (Math.random() - 0.5) * 0.06;
        const next = Math.max(0.15, Math.min(1.0, prev + delta));
        return Number(next.toFixed(2));
      });
    }, 3500);
    return () => window.clearInterval(timer);
  }, []);

  // タイピング非表示時は気配リストをクリア
  useEffect(() => {
    if (!isTypingVisible) {
      setTypingUsers([]);
    }
  }, [isTypingVisible]);

  const sendWsEvent = useCallback((event: ClientToServerWsEvent) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(event));
    }
  }, []);

  const setManualHeatBoost = useCallback((boost: number) => {
    setHeatLevel((prev) => Math.min(1.0, Number((prev + boost).toFixed(2))));
  }, []);

  return {
    isConnected,
    heatLevel,
    typingUsers,
    sendWsEvent,
    setManualHeatBoost,
  };
}
