'use client';

import { Flame, LogIn, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useFirebase } from '@/hooks/useFirebase';

export default function Home() {
  const {
    user,
    loading,
    loginWithGoogle,
    error: firebaseError,
  } = useFirebase();
  const router = useRouter();
  const [authError, setAuthError] = useState<string | null>(null);

  // 既にログインしている場合は自動的に /app へ遷移
  useEffect(() => {
    if (!loading && user) {
      router.push('/app');
    }
  }, [user, loading, router]);

  // リダイレクト時のログインエラーを検知して表示
  useEffect(() => {
    if (firebaseError) {
      setAuthError('Google ログインに失敗しました。再度お試しください。');
    }
  }, [firebaseError]);

  const handleGoogleLogin = async () => {
    try {
      setAuthError(null);
      await loginWithGoogle();
    } catch (err) {
      console.error(err);
      setAuthError('Google ログインに失敗しました。再度お試しください。');
    }
  };

  const handleGuestEnter = () => {
    // Cookie に userId がなければバックエンド側でゲストが自動生成されるため直接遷移
    router.push('/app');
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#0A0A0C] text-[#F5F5F7]">
        <div className="flex flex-col items-center gap-4">
          <Flame className="w-12 h-12 text-[#FF5722] animate-pulse" />
          <p className="text-[#8E8E93] text-base animate-pulse">
            気配を整えています...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-[#0A0A0C] text-[#F5F5F7] px-6 select-none">
      <main className="w-full max-w-md flex flex-col items-center text-center gap-8 py-16">
        {/* ロゴと炎の演出 */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-[#131316] border border-[#1F1F23] flex items-center justify-center shadow-lg relative group">
            <div className="absolute inset-0 rounded-full bg-[#FF5722] opacity-10 blur-md group-hover:opacity-20 transition-opacity" />
            <Flame className="w-10 h-10 text-[#FF5722] relative z-10" />
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold tracking-wider font-sans">
              Irori <span className="text-[#8E8E93] font-light">| イロリ</span>
            </h1>
            <p className="text-base text-[#8E8E93] max-w-sm">
              デジタルな囲炉裏を囲み、
              <br />
              穏やかに、静かに語り合うチャットスペース。
            </p>
          </div>
        </div>

        {/* アクションボタン */}
        <div className="w-full flex flex-col gap-4">
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full h-12 rounded-md bg-[#FF5722] text-white font-bold text-base flex items-center justify-center gap-2 hover:bg-[#E64A19] active:scale-95 transition-all cursor-pointer shadow-md border-0"
          >
            <LogIn className="w-5 h-5" />
            Google アカウントで入る
          </button>

          <button
            type="button"
            onClick={handleGuestEnter}
            className="w-full h-12 rounded-md bg-[#131316] text-[#F5F5F7] font-semibold text-base flex items-center justify-center gap-2 hover:bg-[#18181C] border border-[#1F1F23] active:scale-95 transition-all cursor-pointer"
          >
            <User className="w-5 h-5 text-[#8E8E93]" />
            ゲスト（ログインなし）で入る
          </button>
        </div>

        {authError && (
          <p className="text-sm text-red-500 bg-red-950/30 border border-red-900/50 py-2 px-4 rounded-md">
            {authError}
          </p>
        )}

        {/* フッター */}
        <div className="text-sm text-[#8E8E93] mt-8 flex flex-col gap-1">
          <p>完全招待制 ・ 24 時間メッセージ自動消滅機能搭載</p>
          <p className="text-xs text-[#8E8E93]/60">© 2026 Irori Project</p>
        </div>
      </main>
    </div>
  );
}
