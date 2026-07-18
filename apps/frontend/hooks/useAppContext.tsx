'use client';

import type { rooms, users } from 'backend/src/db/schema';
import type React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import { client } from '../lib/api';
import { useFirebase } from './useFirebase';

export type DbUser = typeof users.$inferSelect;
export type DbRoom = typeof rooms.$inferSelect;

interface AppContextType {
  user: DbUser | null;
  // biome-ignore lint/suspicious/noExplicitAny: firebaseUser holds raw Firebase User object from Firebase SDK
  firebaseUser: any | null;
  token: string | null;
  rooms: DbRoom[];
  friends: DbUser[];
  activeRoomId: string | null;
  setActiveRoomId: (id: string | null) => void;
  refreshUser: () => Promise<void>;
  refreshRooms: () => Promise<void>;
  refreshFriends: () => Promise<void>;
  logoutUser: () => Promise<void>;
  loading: boolean;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const {
    user: firebaseUser,
    token,
    loading: authLoading,
    logout,
  } = useFirebase();
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [rooms, setRooms] = useState<DbRoom[]>([]);
  const [friends, setFriends] = useState<DbUser[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // 認証ヘッダーを付与した API クライアント用設定
  const getHeaders = () => {
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  };

  // ユーザー情報の取得または新規ゲスト自動生成の同期
  const fetchUser = async () => {
    try {
      const res = await client.api.v1.users.me.$get(
        {},
        { headers: getHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        setDbUser(data as DbUser);
      }
    } catch (err) {
      console.error('Failed to fetch user:', err);
    }
  };

  const refreshRooms = async () => {
    if (!token && !document.cookie.includes('userId')) return;
    try {
      const res = await client.api.v1.rooms.$get({}, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setRooms(data.rooms as DbRoom[]);
      }
    } catch (err) {
      console.error('Failed to fetch rooms:', err);
    }
  };

  const refreshFriends = async () => {
    if (!token && !document.cookie.includes('userId')) return;
    try {
      const res = await client.api.v1.friends.$get(
        {},
        { headers: getHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        setFriends(data.friends as DbUser[]);
      }
    } catch (err) {
      console.error('Failed to fetch friends:', err);
    }
  };

  // 認証トークン読み込み完了後、ユーザー情報・ルーム・フレンド一覧を順番に取得してローディングを解除する
  // biome-ignore lint/correctness/useExhaustiveDependencies: initUser/refreshRooms/refreshFriends changes reference on every render. token and authLoading dependencies are sufficient.
  useEffect(() => {
    if (authLoading) return;

    const init = async () => {
      setLoading(true);
      await fetchUser();
      if (token || document.cookie.includes('userId')) {
        await Promise.all([refreshRooms(), refreshFriends()]);
      } else {
        setRooms([]);
        setFriends([]);
      }
      setLoading(false);
    };

    init();
  }, [token, authLoading]);

  const logoutUser = async () => {
    setLoading(true);
    await logout();
    setDbUser(null);
    setRooms([]);
    setFriends([]);
    setActiveRoomId(null);
    setIsSidebarOpen(false);
    setIsSettingsOpen(false);
    setLoading(false);
  };

  return (
    <AppContext.Provider
      value={{
        user: dbUser,
        firebaseUser,
        token,
        rooms,
        friends,
        activeRoomId,
        setActiveRoomId,
        refreshUser: fetchUser,
        refreshRooms,
        refreshFriends,
        logoutUser,
        loading: authLoading || loading,
        isSidebarOpen,
        setIsSidebarOpen,
        isSettingsOpen,
        setIsSettingsOpen,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
