import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { IroriFlameLogo } from '~/components/ui/irori-icons';
import { verifySessionFromRequest } from '~/lib/auth/session.server';
import type { Route } from './+types/welcome';

export function meta(_args: Route.MetaArgs) {
  return [
    {
      title: 'Irori (イロリ) — ログイン',
    },
    {
      name: 'description',
      content:
        '少人数のためのプライベート・チャット。安心できる距離感とゼロ知識暗号化。',
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await verifySessionFromRequest(request);
  return {
    isAuthenticated: Boolean(session),
    userName: session?.defaultName ?? null,
  };
}

export default function WelcomeRoute({ loaderData }: Route.ComponentProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const returnTo = searchParams.get('returnTo') || '/';
  const oauthError = searchParams.get('error');
  const [inviteInput, setInviteInput] = useState('');

  const handleInviteNavigate = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = inviteInput.trim();
    if (!raw) return;

    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      try {
        const parsed = new URL(raw);
        navigate(`${parsed.pathname}${parsed.hash}`);
        return;
      } catch {
        // fallback below
      }
    }

    if (raw.startsWith('/join/')) {
      navigate(raw);
      return;
    }

    const [spacePart, hashPart] = raw.split('#');
    const cleanSpaceId = spacePart.replace(/^\/+/, '');
    const hashSuffix = hashPart
      ? `#${hashPart.startsWith('key=') ? hashPart : `key=${hashPart}`}`
      : '';
    navigate(`/join/${cleanSpaceId}${hashSuffix}`);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-[#F5F5F7] flex flex-col relative overflow-hidden">
      {/* 上部ナビゲーションバー */}
      <header className="border-b border-[#1F1F24] bg-[#0D0D10]/80 backdrop-blur-md px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <IroriFlameLogo className="w-7 h-7 sm:w-8 sm:h-8" glowing />
          <span className="text-lg sm:text-xl font-bold text-[#FF7A45]">
            Irori
          </span>
          <span className="hidden sm:inline-block text-xs px-2 py-0.5 rounded-full bg-[#261712] text-[#FF5722] border border-[#FF5722]/30 font-mono">
            Zero-Knowledge E2EE
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 text-xs">
          {loaderData.isAuthenticated ? (
            <>
              <Link
                to="/restore-key"
                className="hidden sm:inline-block px-3 py-1.5 rounded-xl bg-[#18181C] hover:bg-[#1F1F24] border border-white/[0.08] text-[#D4D4D8] transition-colors"
              >
                🔑 鍵バックアップ
              </Link>
              <Link
                to="/"
                className="min-h-[36px] px-3.5 sm:px-4 py-1.5 rounded-xl bg-[#FF5722] hover:bg-[#EA580C] text-white font-semibold inline-flex items-center transition-colors"
              >
                スペースへ進む
              </Link>
            </>
          ) : (
            <a
              href={`/auth/google?returnTo=${encodeURIComponent(returnTo)}`}
              className="min-h-[36px] px-3.5 sm:px-4 py-1.5 rounded-xl bg-[#FF5722] hover:bg-[#EA580C] text-white font-semibold inline-flex items-center transition-colors"
            >
              Google でログイン
            </a>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-12 flex flex-col justify-center relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-center">
          {/* 左カラム: コンセプト紹介 */}
          <div className="lg:col-span-7 space-y-4 sm:space-y-6">
            <h1 className="text-2xl sm:text-4xl font-bold leading-tight text-[#F5F5F7] budoux-text">
              少人数のためのプライベート・チャット
              <span className="block text-[#FF7A45] mt-1 sm:mt-2">
                安心できる距離感とゼロ知識暗号化
              </span>
            </h1>

            <p className="text-sm sm:text-base text-[#8E8E93] leading-relaxed budoux-text">
              常時接続や即レスのプレッシャーから解放され、親しい仲間やチームと安心して会話できる居場所です。
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
              <div className="p-4 rounded-2xl bg-[#18181C] border border-white/[0.06]">
                <div className="text-sm font-semibold text-[#F5F5F7] mb-1">
                  🎛️ チャンネルごとの柔軟な設定
                </div>
                <p className="text-xs text-[#8E8E93] leading-relaxed">
                  既読・入力中表示・スレッド・メンション・24時間自動消去・匿名モードをチャンネルごとに自由に設定できます。
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#18181C] border border-white/[0.06]">
                <div className="text-sm font-semibold text-[#F5F5F7] mb-1">
                  🔒 エンドツーエンド暗号化 (E2EE)
                </div>
                <p className="text-xs text-[#8E8E93] leading-relaxed">
                  お使いの端末でのみ暗号化・復号されるため、サービスの運営者であっても会話内容を閲覧することはできません。
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#18181C] border border-white/[0.06]">
                <div className="text-sm font-semibold text-[#F5F5F7] mb-1">
                  💬 自由な編集・削除
                </div>
                <p className="text-xs text-[#8E8E93] leading-relaxed">
                  送信したメッセージは時間制限なく編集・削除できます。うっかり書き間違えても安心です。
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#18181C] border border-white/[0.06]">
                <div className="text-sm font-semibold text-[#F5F5F7] mb-1">
                  🔖 自分専用メモ ＆ 送信待機
                </div>
                <p className="text-xs text-[#8E8E93] leading-relaxed">
                  他の人には見えない自分専用の非公開メモや、相手がオンラインになった時に届ける送信待機機能。
                </p>
              </div>
            </div>
          </div>

          {/* 右カラム: ログイン / 招待参加 */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl bg-[#131316] border border-white/[0.08] p-6 shadow-2xl space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#F5F5F7]">ログイン</h2>
                  <p className="text-xs text-[#8E8E93] mt-0.5">
                    Google アカウントで安全にログイン
                  </p>
                </div>
                <IroriFlameLogo className="w-9 h-9" glowing />
              </div>

              {oauthError && (
                <div className="p-3.5 rounded-xl bg-[#261712] border border-[#EF4444]/40 text-xs text-[#FCA5A5] space-y-1">
                  <div className="font-semibold">
                    {oauthError === 'oauth_not_configured'
                      ? 'Google OAuth クレデンシャルが未設定です'
                      : 'Google OAuth 認証コールバックの検証に失敗しました'}
                  </div>
                  <p className="text-[11px] text-[#D4D4D8]">
                    <code>.dev.vars</code>（本番は <code>wrangler secret</code>
                    ）に <code>GOOGLE_CLIENT_ID</code> と{' '}
                    <code>GOOGLE_CLIENT_SECRET</code> を設定してください。
                  </p>
                </div>
              )}

              <div className="space-y-2.5">
                <a
                  href={`/auth/google?returnTo=${encodeURIComponent(returnTo)}`}
                  className="w-full py-3 px-4 rounded-xl bg-[#FF5722] hover:bg-[#EA580C] text-white text-sm font-semibold shadow-[0_0_20px_rgba(255,87,34,0.3)] transition-all flex items-center justify-center gap-2"
                >
                  <span>🔐</span>
                  <span>Google アカウントでログイン</span>
                </a>
              </div>

              <form
                onSubmit={handleInviteNavigate}
                className="border-t border-[#1F1F24] pt-4 space-y-2.5"
              >
                <label
                  htmlFor="invite-link-input"
                  className="block text-xs font-medium text-[#D4D4D8]"
                >
                  招待リンクで参加
                </label>
                <div className="flex gap-2">
                  <input
                    id="invite-link-input"
                    type="text"
                    placeholder="/join/space_id#key=..."
                    value={inviteInput}
                    onChange={(e) => setInviteInput(e.target.value)}
                    className="flex-1 min-w-0 bg-[#18181C] border border-white/10 rounded-xl px-3 py-2 text-xs text-[#F5F5F7] font-mono"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 rounded-xl bg-[#1F1F24] hover:bg-[#261712] border border-white/10 text-xs font-medium text-[#F5F5F7] shrink-0 flex items-center"
                  >
                    参加画面へ
                  </button>
                </div>
                <p className="text-[11px] text-[#8E8E93]">
                  ※
                  招待リンクの暗号鍵はサーバーには送信されず、お使いの端末でのみ復号に使用されます。
                </p>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
