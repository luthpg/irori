import { useState } from 'react';
import { Form, Link, redirect, useNavigate, useSubmit } from 'react-router';
import { IroriFlameLogo } from '~/components/ui/irori-icons';
import { requireAuth } from '~/lib/auth/session.server';
import {
  ensureLocalIdentityKeys,
  generateNewSpaceMasterKey,
} from '~/lib/crypto/e2ee.client';
import type {
  ChannelEntity,
  JoinedSpaceSummary,
  SpaceMemberEntity,
  SpaceMetaEntity,
} from '~/lib/schemas';
import { callSpaceActor, callUserActor } from '../../workers/rpc.server';
import type { Route } from './+types/_index';

export function meta(_args: Route.MetaArgs) {
  return [
    {
      title: 'Irori (イロリ) — プライベート・チャット',
    },
    {
      name: 'description',
      content: '少人数で心地よく使えるプライベート・チャット',
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session, rollingSetCookie } = await requireAuth(request);
  const joinedSpaces = await callUserActor<JoinedSpaceSummary[]>(
    session.userId,
    'getJoinedSpaces',
  );

  if (joinedSpaces.length > 0) {
    return redirect(`/chat/${joinedSpaces[0].spaceId}/takibi`, {
      headers: rollingSetCookie
        ? { 'Set-Cookie': rollingSetCookie }
        : undefined,
    });
  }

  return {
    session,
    joinedSpaces,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { session, rollingSetCookie } = await requireAuth(request);
  const formData = await request.formData();

  const rawSpaceId = String(formData.get('spaceId') || '').trim();
  const spaceId =
    rawSpaceId.replace(/[^a-zA-Z0-9_-]/g, '') ||
    `irori-${Date.now().toString(36)}`;
  const name =
    String(formData.get('name') || 'マイ・スペース').trim() || 'マイ・スペース';
  const badge =
    String(formData.get('badge') || '完全招待制').trim() || '完全招待制';
  const themeColor =
    (formData.get('themeColor') as 'amber' | 'blue' | 'emerald' | null) ||
    'amber';
  const maxMembers = Number(formData.get('maxMembers') || 6);
  const initialChannelName =
    String(formData.get('initialChannelName') || '雑談').trim() || '雑談';
  const wrappedSpaceKey = String(formData.get('wrappedSpaceKey') || '').trim();
  const inviteKeyFragment = String(
    formData.get('inviteKeyFragment') || '',
  ).trim();

  const created = await callSpaceActor<{
    spaceMeta: SpaceMetaEntity;
    channel: ChannelEntity;
    member: SpaceMemberEntity;
  }>(spaceId, 'createSpace', {
    spaceId,
    name,
    badge,
    iconType: 'flame',
    themeColor,
    maxMembers,
    creatorUserId: session.userId,
    creatorMemberId: session.memberId,
    creatorName: session.defaultName,
    wrappedSpaceKey: wrappedSpaceKey || 'umk_wrap_v1:initial',
    initialChannelName,
  });

  await callUserActor(session.userId, 'addJoinedSpace', {
    spaceId,
    spaceName: created.spaceMeta.name,
    themeColor: created.spaceMeta.themeColor,
    role: 'admin',
  });

  const hashSuffix = inviteKeyFragment ? `#key=${inviteKeyFragment}` : '';
  return redirect(`/chat/${spaceId}/${created.channel.id}${hashSuffix}`, {
    headers: rollingSetCookie ? { 'Set-Cookie': rollingSetCookie } : undefined,
  });
}

export default function IndexOnboardingRoute({
  loaderData,
}: Route.ComponentProps) {
  const { session } = loaderData;
  const submit = useSubmit();
  const navigate = useNavigate();

  const [spaceName, setSpaceName] = useState('マイ・スペース');
  const [initialChannelName, setInitialChannelName] = useState('雑談');
  const [maxMembers, setMaxMembers] = useState(6);
  const [themeColor, setThemeColor] = useState<'amber' | 'blue' | 'emerald'>(
    'amber',
  );
  const [inviteLinkInput, setInviteLinkInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateSpace = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isCreating) return;
    setIsCreating(true);

    try {
      await ensureLocalIdentityKeys();
      const spaceId = `irori-${Date.now().toString(36)}`;
      const { inviteKeyFragment, wrappedSpaceKey } =
        await generateNewSpaceMasterKey(spaceId, 1);

      const formData = new FormData();
      formData.set('spaceId', spaceId);
      formData.set('name', spaceName);
      formData.set('initialChannelName', initialChannelName);
      formData.set('maxMembers', String(maxMembers));
      formData.set('themeColor', themeColor);
      formData.set('wrappedSpaceKey', wrappedSpaceKey);
      formData.set('inviteKeyFragment', inviteKeyFragment);

      submit(formData, { method: 'post' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinByLink = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = inviteLinkInput.trim();
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
    <div className="min-h-screen bg-[#0A0A0C] text-[#F5F5F7] flex flex-col">
      <header className="border-b border-[#1F1F24] bg-[#0D0D10] px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <IroriFlameLogo className="w-6 h-6 sm:w-7 sm:h-7" glowing />
          <span className="text-base font-bold text-[#FF7A45]">Irori</span>
          <span className="hidden sm:inline text-xs text-[#8E8E93]">
            ようこそ、{session.defaultName} さん
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Link
            to="/restore-key"
            className="hidden sm:inline-flex px-3 py-1.5 rounded-xl bg-[#18181C] hover:bg-[#1F1F24] border border-white/[0.08] text-[#D4D4D8]"
          >
            🔑 鍵管理
          </Link>
          <Form method="post" action="/auth/logout">
            <button
              type="submit"
              className="px-3 py-1.5 rounded-xl bg-[#18181C] hover:bg-[#1F1F24] border border-white/[0.08] text-[#8E8E93] hover:text-[#F5F5F7]"
            >
              ログアウト
            </button>
          </Form>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-12 flex flex-col justify-center">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl font-bold text-[#F5F5F7]">
            スペースを作成するか、招待リンクで参加しましょう
          </h1>
          <p className="text-xs text-[#8E8E93] mt-1">
            スペース作成時にブラウザ内で暗号鍵を安全に生成し、お使いの端末に保管します。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {/* 左カード: 新規スペース作成 */}
          <div className="rounded-2xl bg-[#131316] border border-white/[0.08] p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#F5F5F7]">
                新しいスペースを作成する
              </h2>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#261712] text-[#FF7A45]">
                E2EE
              </span>
            </div>

            <Form onSubmit={handleCreateSpace} className="space-y-3.5">
              <div>
                <label
                  htmlFor="new-space-name"
                  className="block text-xs text-[#8E8E93] mb-1"
                >
                  スペース名
                </label>
                <input
                  id="new-space-name"
                  type="text"
                  required
                  value={spaceName}
                  onChange={(e) => setSpaceName(e.target.value)}
                  className="w-full bg-[#18181C] border border-white/10 rounded-xl px-3.5 py-2 text-sm text-[#F5F5F7]"
                />
              </div>

              <div>
                <label
                  htmlFor="new-channel-name"
                  className="block text-xs text-[#8E8E93] mb-1"
                >
                  最初のチャンネル名
                </label>
                <input
                  id="new-channel-name"
                  type="text"
                  required
                  value={initialChannelName}
                  onChange={(e) => setInitialChannelName(e.target.value)}
                  className="w-full bg-[#18181C] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-[#F5F5F7]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="new-space-cap"
                    className="block text-xs text-[#8E8E93] mb-1"
                  >
                    定員上限（2〜50名）
                  </label>
                  <input
                    id="new-space-cap"
                    type="number"
                    min={2}
                    max={50}
                    value={maxMembers}
                    onChange={(e) => setMaxMembers(Number(e.target.value) || 6)}
                    className="w-full bg-[#18181C] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-[#F5F5F7] font-mono"
                  />
                </div>

                <div>
                  <label
                    htmlFor="new-space-theme"
                    className="block text-xs text-[#8E8E93] mb-1"
                  >
                    テーマカラー
                  </label>
                  <select
                    id="new-space-theme"
                    value={themeColor}
                    onChange={(e) =>
                      setThemeColor(
                        e.target.value as 'amber' | 'blue' | 'emerald',
                      )
                    }
                    className="w-full bg-[#18181C] border border-white/10 rounded-xl px-3 py-2 text-xs text-[#F5F5F7]"
                  >
                    <option value="amber">オレンジ (Amber)</option>
                    <option value="blue">ブルー (Blue)</option>
                    <option value="emerald">エメラルド (Emerald)</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={isCreating}
                className="w-full py-2.5 rounded-xl bg-[#FF5722] hover:bg-[#EA580C] text-white text-xs font-semibold transition-colors"
              >
                {isCreating ? '暗号鍵を生成中...' : 'スペースを作成する'}
              </button>
            </Form>
          </div>

          {/* 右カード: 招待リンクで参加 */}
          <div className="rounded-2xl bg-[#131316] border border-white/[0.08] p-6 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <h2 className="text-base font-bold text-[#F5F5F7]">
                ✉️ 招待リンクで参加
              </h2>
              <p className="text-xs text-[#8E8E93] leading-relaxed">
                共有された招待リンク（<code>/join/:spaceId#key=...</code>
                ）を入力して参加します。URL の <code>#key=</code>{' '}
                以降はサーバーに送信されず、お使いの端末で直接復号に使われます。
              </p>

              <form onSubmit={handleJoinByLink} className="space-y-3 pt-2">
                <input
                  type="text"
                  placeholder="/join/space-id#key=..."
                  value={inviteLinkInput}
                  onChange={(e) => setInviteLinkInput(e.target.value)}
                  className="w-full bg-[#18181C] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-[#F5F5F7] font-mono"
                />
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-[#1F1F24] hover:bg-[#261712] border border-white/10 text-xs font-semibold text-[#F5F5F7] transition-colors"
                >
                  招待リンクを開く →
                </button>
              </form>
            </div>

            <div className="p-3.5 rounded-xl bg-[#18181C] border border-white/[0.06] text-[11px] text-[#8E8E93]">
              💡 6桁PINコードや既存端末からのQR同期を行う場合は{' '}
              <Link
                to="/restore-key"
                className="text-[#FF7A45] underline hover:no-underline"
              >
                暗号鍵のバックアップ・復元
              </Link>{' '}
              へ進んでください。
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
