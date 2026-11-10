import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from 'react-router';
import { IroriFlameLogo } from '~/components/ui/irori-icons';

import type { Route } from './+types/root';
import './app.css';

export const links: Route.LinksFunction = () => [
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&family=Noto+Sans+Mono:wght@400;500&display=swap',
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="bg-[#0A0A0C] text-[#F5F5F7] antialiased selection:bg-[#FF5722]/30 selection:text-[#F5F5F7]">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let statusCode = 500;
  let message = 'エラーが発生しました';
  let details =
    '一時的な通信エラーまたは予期しない問題が発生しました。しばらく待ってから再度お試しください。';
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    statusCode = error.status;
    if (error.status === 404) {
      message = 'お探しのページまたはチャンネルが見つかりません';
      details = 'リンクが変更されたか、有効期限が切れた可能性があります。';
    } else if (error.status === 401 || error.status === 403) {
      message = 'このスペースへのアクセス権がありません';
      details =
        'ログインの有効期限が切れているか、スペースへの参加が必要です。';
    } else if (error.status === 429) {
      message = 'リクエスト制限を超過しました';
      details =
        '短時間に多くの操作が行われました。少し時間をおいてから再度お試しください。';
    } else {
      details = error.statusText || details;
    }
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="min-h-screen bg-[#0A0A0C] text-[#F5F5F7] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div
        className="pointer-events-none fixed inset-0 opacity-30"
        style={{
          background:
            'radial-gradient(circle at 50% 35%, rgba(255, 87, 34, 0.16), transparent 60%)',
        }}
      />
      <div className="max-w-md w-full bg-[#131316] border border-white/[0.08] rounded-2xl p-6 shadow-2xl relative z-10 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <IroriFlameLogo className="w-8 h-8" glowing />
            <span className="text-lg font-bold text-[#FF7A45]">Irori</span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-[#261712] border border-[#FF5722]/30 font-mono text-xs text-[#FF7A45]">
            HTTP {statusCode}
          </span>
        </div>

        <div>
          <h1 className="text-lg font-bold text-[#F5F5F7] mb-1.5">{message}</h1>
          <p className="text-xs text-[#8E8E93] leading-relaxed">{details}</p>
        </div>

        {import.meta.env.DEV && stack && (
          <pre className="w-full p-3 bg-[#0D0D10] border border-white/[0.06] rounded-xl text-[11px] text-[#8E8E93] overflow-x-auto font-mono max-h-48">
            <code>{stack}</code>
          </pre>
        )}

        <div className="flex items-center gap-2.5 pt-2">
          <a
            href="/"
            className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-[#FF5722] text-white text-xs font-semibold hover:bg-[#EA580C] transition-colors"
          >
            ホームへ戻る
          </a>
          <a
            href="/welcome"
            className="px-4 py-2.5 rounded-xl bg-[#18181C] border border-white/10 text-[#D4D4D8] hover:text-white text-xs font-medium transition-colors"
          >
            ログイン画面へ
          </a>
        </div>
      </div>
    </main>
  );
}
