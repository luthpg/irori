import { useEffect, useState } from 'react';
import { Form, Link, redirect, useActionData, useSubmit } from 'react-router';
import { IroriFlameLogo } from '~/components/ui/irori-icons';
import { requireAuth } from '~/lib/auth/session.server';
import {
  ensureLocalIdentityKeys,
  importSpaceMasterKeyFromFragment,
} from '~/lib/crypto/e2ee.client';
import type { SpaceMemberEntity, SpaceMetaEntity } from '~/lib/schemas';
import { callSpaceActor, callUserActor } from '../../workers/rpc.server';
import type { Route } from './+types/join.$spaceId';

export function meta({ params }: Route.MetaArgs) {
  return [
    {
      title: `スペース招待参加 (${params.spaceId}) — Irori (イロリ)`,
    },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const spaceId = params.spaceId || '';
  const { session } = await requireAuth(request, {
    redirectTo: `/welcome?returnTo=${encodeURIComponent(`/join/${spaceId}`)}`,
  });

  const summary = await callSpaceActor<
    | {
        exists: true;
        spaceId: string;
        name: string;
        badge: string;
        themeColor: 'amber' | 'blue' | 'emerald';
        memberCount: number;
        maxMembers: number;
        currentKeyEpoch: number;
        defaultChannelId: string;
        defaultChannelName: string;
      }
    | { exists: false; spaceId: string }
  >(spaceId, 'getSpacePublicSummary');

  return {
    session,
    summary,
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  const spaceId = params.spaceId || '';
  const { session, rollingSetCookie } = await requireAuth(request);
  const formData = await request.formData();

  const overrideName =
    String(formData.get('overrideName') || '').trim() || session.defaultName;
  const overrideBio =
    String(formData.get('overrideBio') || '').trim() ||
    '招待リンクから参加しました';
  const wrappedSpaceKey = String(formData.get('wrappedSpaceKey') || '').trim();

  if (!wrappedSpaceKey) {
    return {
      ok: false as const,
      error:
        '招待リンクに暗号鍵が含まれていません。完全な招待リンクを開いてください。',
    };
  }

  const joinResult = await callSpaceActor<
    | {
        ok: true;
        spaceMeta: SpaceMetaEntity;
        defaultChannelId: string;
        member: SpaceMemberEntity;
      }
    | { ok: false; error: 'SPACE_NOT_FOUND' | 'SPACE_FULL' }
  >(spaceId, 'joinMember', {
    memberId: session.memberId,
    userId: session.userId,
    overrideName,
    overrideBio,
    wrappedSpaceKey,
  });

  if (!joinResult.ok) {
    return {
      ok: false as const,
      error:
        joinResult.error === 'SPACE_FULL'
          ? 'このスペースは定員上限に達しているため参加できません。'
          : '指定されたスペースが存在しません。',
    };
  }

  await callUserActor(session.userId, 'addJoinedSpace', {
    spaceId,
    spaceName: joinResult.spaceMeta.name,
    themeColor: joinResult.spaceMeta.themeColor,
    role: joinResult.member.role,
  });

  return redirect(`/chat/${spaceId}/${joinResult.defaultChannelId}`, {
    headers: rollingSetCookie ? { 'Set-Cookie': rollingSetCookie } : undefined,
  });
}

export default function JoinSpaceRoute({ loaderData }: Route.ComponentProps) {
  const { session, summary } = loaderData;
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();

  const [overrideName, setOverrideName] = useState(session.defaultName);
  const [overrideBio, setOverrideBio] = useState('招待リンクから参加しました');
  const [keyFragment, setKeyFragment] = useState('');
  const [keyStatus, setKeyStatus] = useState<
    'checking' | 'ready' | 'missing' | 'invalid'
  >('checking');

  useEffect(() => {
    ensureLocalIdentityKeys().catch(() => {});
    if (typeof window === 'undefined') return;
    const rawHash = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(
      rawHash.includes('=') ? rawHash : `key=${rawHash}`,
    );
    const extracted = params.get('key') || '';
    if (extracted) {
      setKeyFragment(extracted);
      setKeyStatus('ready');
    } else {
      setKeyStatus('missing');
    }
  }, []);

  const handleJoinSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!keyFragment.trim()) {
      setKeyStatus('missing');
      return;
    }

    try {
      const epoch = summary.exists ? summary.currentKeyEpoch : 1;
      const { wrappedSpaceKey } = await importSpaceMasterKeyFromFragment(
        summary.spaceId,
        keyFragment.trim(),
        epoch,
      );

      const formData = new FormData();
      formData.set('overrideName', overrideName);
      formData.set('overrideBio', overrideBio);
      formData.set('wrappedSpaceKey', wrappedSpaceKey);
      submit(formData, { method: 'post' });
    } catch {
      setKeyStatus('invalid');
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-[#F5F5F7] flex flex-col">
      <header className="border-b border-[#1F1F24] bg-[#0D0D10] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <IroriFlameLogo className="w-7 h-7" glowing />
          <span className="text-base font-bold text-[#FF7A45]">
            Irori スペース招待参加
          </span>
        </div>
        <Link
          to="/"
          className="px-3 py-1.5 rounded-xl bg-[#18181C] hover:bg-[#1F1F24] text-xs text-[#D4D4D8]"
        >
          ← ホームへ戻る
        </Link>
      </header>

      <main className="flex-1 max-w-lg w-full mx-auto px-6 py-12 flex flex-col justify-center">
        <div className="rounded-2xl bg-[#131316] border border-white/[0.08] p-6 shadow-2xl space-y-5">
          {!summary.exists ? (
            <div className="space-y-4 text-center py-4">
              <div className="text-base font-bold text-[#F5F5F7]">
                スペース「{summary.spaceId}」が見つかりません
              </div>
              <p className="text-xs text-[#8E8E93]">
                招待リンクの URL
                が正しいか確認するか、新しいスペースを作成してください。
              </p>
              <Link
                to="/"
                className="inline-block px-4 py-2.5 rounded-xl bg-[#FF5722] text-white text-xs font-semibold"
              >
                新しいスペースを作成する
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-[#1F1F24] pb-4">
                <div>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#261712] text-[#FF7A45] border border-[#FF5722]/30">
                    {summary.badge}
                  </span>
                  <h1 className="text-xl font-bold text-[#F5F5F7] mt-1.5">
                    {summary.name}
                  </h1>
                  <p className="text-xs text-[#8E8E93] mt-0.5">
                    参加メンバー: {summary.memberCount} / {summary.maxMembers}{' '}
                    名 · 初期チャンネル: #{summary.defaultChannelName}
                  </p>
                </div>
                <IroriFlameLogo className="w-10 h-10" glowing />
              </div>

              {actionData?.error && (
                <div className="p-3 rounded-xl bg-[#EF4444]/15 border border-[#EF4444]/40 text-xs text-[#FCA5A5]">
                  {actionData.error}
                </div>
              )}

              <Form onSubmit={handleJoinSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="join-override-name"
                    className="block text-xs text-[#8E8E93] mb-1"
                  >
                    このスペースでの表示名
                  </label>
                  <input
                    id="join-override-name"
                    type="text"
                    required
                    value={overrideName}
                    onChange={(e) => setOverrideName(e.target.value)}
                    className="w-full bg-[#18181C] border border-white/10 rounded-xl px-3.5 py-2 text-sm text-[#F5F5F7]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="join-override-bio"
                    className="block text-xs text-[#8E8E93] mb-1"
                  >
                    ひとこと自己紹介
                  </label>
                  <input
                    id="join-override-bio"
                    type="text"
                    value={overrideBio}
                    onChange={(e) => setOverrideBio(e.target.value)}
                    className="w-full bg-[#18181C] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-[#F5F5F7]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="join-smk-fragment"
                    className="block text-xs text-[#8E8E93] mb-1"
                  >
                    スペース暗号鍵 (#key=...)
                  </label>
                  <input
                    id="join-smk-fragment"
                    type="text"
                    required
                    placeholder="Base64Url 256-bit SMK"
                    value={keyFragment}
                    onChange={(e) => {
                      setKeyFragment(e.target.value);
                      setKeyStatus('ready');
                    }}
                    className="w-full bg-[#18181C] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-[#F5F5F7] font-mono"
                  />
                  {keyStatus === 'missing' && (
                    <p className="text-[11px] text-[#F59E0B] mt-1">
                      URL 末尾の <code>#key=...</code>{' '}
                      が含まれていません。招待リンクの鍵を入力してください。
                    </p>
                  )}
                  {keyStatus === 'invalid' && (
                    <p className="text-[11px] text-[#EF4444] mt-1">
                      暗号鍵の形式が不正です。
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-[#FF5722] hover:bg-[#EA580C] text-white text-sm font-semibold transition-colors"
                >
                  「{summary.name}」へ参加する
                </button>
              </Form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
