import { useState } from 'react';
import { Link, redirect, useFetcher } from 'react-router';
import { IroriFlameLogo, MemberAvatar } from '~/components/ui/irori-icons';
import { requireAuth } from '~/lib/auth/session.server';
import { encryptForSpace } from '~/lib/crypto/envelope.client';
import { ENTER_KEY_STORAGE_KEY } from '~/lib/keyboard';
import type {
  ChannelEntity,
  CustomEmojiEntity,
  EnterKeyBehavior,
  JoinedSpaceSummary,
  MockSpace,
  SpaceMetaEntity,
  UserProfileEntity,
  WebhookEntity,
} from '~/lib/schemas';
import { callSpaceActor, callUserActor } from '../../workers/rpc.server';
import type { Route } from './+types/settings';

export function meta(_args: Route.MetaArgs) {
  return [
    {
      title: '設定 — Irori',
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session, rollingSetCookie } = await requireAuth(request);
  const joinedSpaces = await callUserActor<JoinedSpaceSummary[]>(
    session.userId,
    'getJoinedSpaces',
  );
  const primarySpaceId = joinedSpaces[0]?.spaceId;
  if (!primarySpaceId) {
    throw redirect('/', {
      headers: rollingSetCookie
        ? { 'Set-Cookie': rollingSetCookie }
        : undefined,
    });
  }

  const [userProfile, bootstrap, existingWebhooks] = await Promise.all([
    callUserActor<UserProfileEntity>(session.userId, 'getProfile'),
    callSpaceActor<{
      spaceMeta: SpaceMetaEntity;
      channels: ChannelEntity[];
      customEmojis: CustomEmojiEntity[];
      myMemberProfile: { overrideName: string; overrideBio: string };
    }>(primarySpaceId, 'getBootstrap', {
      channelId: 'takibi',
      memberId: session.memberId,
    }),
    callSpaceActor<WebhookEntity[]>(primarySpaceId, 'getWebhooks'),
  ]);

  let webhooks = existingWebhooks;
  if (webhooks.length === 0) {
    const defaultWh = await callSpaceActor<WebhookEntity>(
      primarySpaceId,
      'createWebhook',
      {
        channelId: bootstrap.channels[0]?.id || 'takibi',
        label: '外部通知',
        createdByMemberId: session.memberId,
      },
    );
    webhooks = [defaultWh];
  }

  return {
    session,
    userProfile,
    joinedSpaces,
    primarySpaceId,
    spaceMeta: bootstrap.spaceMeta,
    channels: bootstrap.channels,
    customEmojis: bootstrap.customEmojis,
    webhooks,
    myMemberProfile: bootstrap.myMemberProfile,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { session } = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get('intent') || '');

  if (intent === 'updateEnterKeyBehavior') {
    const enterKeyBehavior = (
      String(formData.get('enterKeyBehavior') || 'newline') === 'send'
        ? 'send'
        : 'newline'
    ) as EnterKeyBehavior;
    await callUserActor(session.userId, 'updateEnterKeyBehavior', {
      enterKeyBehavior,
    });
    return Response.json({ ok: true, enterKeyBehavior });
  }

  const spaceId = String(formData.get('spaceId') || '').trim();
  if (!spaceId) {
    return Response.json(
      { ok: false, error: 'Missing spaceId' },
      { status: 400 },
    );
  }

  if (intent === 'updateProfile') {
    await callSpaceActor(spaceId, 'updateMemberProfile', {
      memberId: session.memberId,
      overrideName: String(formData.get('overrideName') || session.defaultName),
      overrideBio: String(formData.get('overrideBio') || ''),
    });
    return Response.json({ ok: true });
  }

  if (intent === 'addEmoji') {
    const created = await callSpaceActor<CustomEmojiEntity>(
      spaceId,
      'addCustomEmoji',
      {
        shortcode: String(formData.get('shortcode') || ':sparkles:'),
        label: String(formData.get('label') || 'カスタム絵文字'),
        previewChar: String(formData.get('previewChar') || '✨'),
        uploadedBy: session.defaultName,
      },
    );
    return Response.json({ ok: true, emoji: created });
  }

  if (intent === 'createWebhook') {
    const created = await callSpaceActor<WebhookEntity>(
      spaceId,
      'createWebhook',
      {
        channelId: String(formData.get('channelId') || 'takibi'),
        label: String(formData.get('label') || '外部通知 Webhook'),
        createdByMemberId: session.memberId,
      },
    );
    return Response.json({ ok: true, webhook: created });
  }

  if (intent === 'rotateKey') {
    const res = await callSpaceActor<{ keyEpoch: number }>(
      spaceId,
      'rotateSpaceKey',
    );
    return Response.json({ ok: true, keyEpoch: res.keyEpoch });
  }

  return Response.json({ ok: false }, { status: 400 });
}

export default function SettingsRoute({ loaderData }: Route.ComponentProps) {
  const fetcher = useFetcher();
  const [spaces, setSpaces] = useState<MockSpace[]>(() => {
    const firstChannelId = loaderData.channels[0]?.id || 'takibi';
    const firstChannelName = loaderData.channels[0]?.name || '雑談';

    return loaderData.joinedSpaces.map((js) => ({
      id: js.spaceId,
      name: js.spaceName,
      badge: loaderData.spaceMeta?.badge || '完全招待制',
      iconType: 'flame',
      themeColor: js.themeColor,
      unreadCount: js.unreadCount,
      hasQuietActivity: js.hasQuietActivity,
      heatLevel: 0.65,
      maxMembers: loaderData.spaceMeta?.maxMembers ?? 6,
      notificationLevel: js.notificationLevel,
      myOverrideName:
        loaderData.myMemberProfile?.overrideName ||
        loaderData.session.defaultName,
      myOverrideBio: loaderData.myMemberProfile?.overrideBio || '',
      channels: [
        {
          id: firstChannelId,
          spaceId: js.spaceId,
          name: firstChannelName,
          emojis: '💬',
          badgeText: '完全招待制',
          iconType: 'green-dot',
          onlineCount: 1,
          heatLevel: 0.5,
          pinnedTopic: {
            title: `${firstChannelName} 📌`,
            description: '',
            updatedAt: '今日',
            commentCount: 0,
          },
          settings: {
            isReadVisible: true,
            isTypingVisible: true,
            isThreadEnabled: true,
            isMentionEnabled: true,
            isEphemeral: false,
            isAnonymousMode: false,
          },
          activeMembers: [],
        },
      ],
    }));
  });

  const [selectedSpaceId, setSelectedSpaceId] = useState<string>(
    loaderData.primarySpaceId,
  );
  const [customEmojis, setCustomEmojis] = useState(() =>
    loaderData.customEmojis.map((e) => ({
      id: e.id,
      shortcode: e.shortcode,
      label: e.label,
      previewChar: e.previewChar,
      uploadedBy: e.uploadedByMemberId,
      createdAt: e.createdAt,
    })),
  );

  const [enterKeyBehavior, setEnterKeyBehavior] = useState<EnterKeyBehavior>(
    () => {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem(ENTER_KEY_STORAGE_KEY);
        if (stored === 'newline' || stored === 'send') return stored;
      }
      return loaderData.userProfile?.enterKeyBehavior ?? 'newline';
    },
  );

  const [newShortcode, setNewShortcode] = useState('');
  const [newEmojiChar, setNewEmojiChar] = useState('🍡');
  const [newEmojiLabel, setNewEmojiLabel] = useState('');
  const [keyEpoch, setKeyEpoch] = useState(
    loaderData.spaceMeta?.currentKeyEpoch ?? 1,
  );
  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<string | null>(null);

  const activeSpace = spaces.find((s) => s.id === selectedSpaceId) ?? spaces[0];
  const activeWebhookToken = loaderData.webhooks[0]?.token || '';

  const handleProfileSave = (name: string, bio: string) => {
    setSpaces((prev) =>
      prev.map((sp) =>
        sp.id === activeSpace.id
          ? { ...sp, myOverrideName: name, myOverrideBio: bio }
          : sp,
      ),
    );
    fetcher.submit(
      {
        intent: 'updateProfile',
        spaceId: activeSpace.id,
        overrideName: name,
        overrideBio: bio,
      },
      { method: 'post' },
    );
    setSavedBanner(`「${activeSpace.name}」のプロフィールを保存しました`);
  };

  const handleEnterKeyBehaviorChange = (behavior: EnterKeyBehavior) => {
    setEnterKeyBehavior(behavior);
    if (typeof window !== 'undefined') {
      localStorage.setItem(ENTER_KEY_STORAGE_KEY, behavior);
    }
    fetcher.submit(
      { intent: 'updateEnterKeyBehavior', enterKeyBehavior: behavior },
      { method: 'post' },
    );
    setSavedBanner('キー操作設定を保存しました');
  };

  const handleAddEmoji = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShortcode.trim()) return;
    const formattedCode = newShortcode.startsWith(':')
      ? newShortcode
      : `:${newShortcode.trim()}:`;

    const newItem = {
      id: `ce-${Date.now()}`,
      shortcode: formattedCode,
      label: newEmojiLabel.trim() || 'カスタム絵文字',
      previewChar: newEmojiChar || '✨',
      uploadedBy: activeSpace.myOverrideName,
      createdAt: 'たった今',
    };
    setCustomEmojis((prev) => [newItem, ...prev]);

    fetcher.submit(
      {
        intent: 'addEmoji',
        spaceId: activeSpace.id,
        shortcode: formattedCode,
        label: newItem.label,
        previewChar: newItem.previewChar,
      },
      { method: 'post' },
    );

    setNewShortcode('');
    setNewEmojiLabel('');
    setSavedBanner(`カスタム絵文字 ${formattedCode} を追加しました`);
  };

  const handleTestEncryptedWebhook = async () => {
    if (!activeWebhookToken) return;
    const encrypted = await encryptForSpace(
      '⚡ [Webhook] 外部サービスからの通知テストです',
      activeSpace.id,
      keyEpoch,
    );
    const res = await fetch(`/api/webhooks/${activeWebhookToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spaceId: activeSpace.id,
        channelId: activeSpace.channels[0].id,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        keyEpoch,
      }),
    });
    if (res.ok) {
      setWebhookStatus(
        '✓ Webhook 通知を送信しました。チャット画面で確認できます。',
      );
    } else {
      setWebhookStatus(
        'Webhook の送信に失敗しました（トークンまたは制限エラー）',
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-[#F5F5F7] flex flex-col">
      <header className="border-b border-[#1F1F24] bg-[#0D0D10] px-4 sm:px-6 py-3 sm:py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <IroriFlameLogo className="w-6 h-6 sm:w-7 sm:h-7" glowing />
          <span className="text-base sm:text-lg font-bold text-[#FF7A45]">
            Irori
          </span>
          <span className="text-xs text-[#8E8E93]">/ 設定</span>
        </div>

        <Link
          to={`/chat/${activeSpace.id}/${activeSpace.channels[0].id}`}
          className="min-h-[36px] px-3 sm:px-3.5 py-1.5 rounded-xl bg-[#FF5722] hover:bg-[#EA580C] text-white text-xs font-semibold inline-flex items-center transition-colors"
        >
          ← チャット画面へ戻る
        </Link>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 space-y-5 sm:space-y-6">
        {savedBanner && (
          <div className="p-3 rounded-xl bg-[#261712] border border-[#FF5722] text-xs text-[#FF7A45] font-medium">
            ✓ {savedBanner}
          </div>
        )}

        {/* キーボード操作設定（PC向け: Enter改行/送信） */}
        <section className="rounded-2xl bg-[#131316] border border-white/[0.08] p-4 sm:p-5 space-y-3.5 sm:space-y-4">
          <div>
            <h2 className="text-base font-bold text-[#F5F5F7]">
              メッセージ送信・キー設定（PC）
            </h2>
            <p className="text-xs text-[#8E8E93] mt-1 leading-relaxed">
              PC環境での Enter
              キーの動作を選択できます。日本語入力（IME）の変換確定に伴う誤送信は自動的に防止されます。
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleEnterKeyBehaviorChange('newline')}
              className={`p-3.5 rounded-xl border text-left transition-colors ${
                enterKeyBehavior === 'newline'
                  ? 'bg-[#261712] border-[#FF5722] text-[#F5F5F7]'
                  : 'bg-[#18181C] border-white/[0.06] text-[#8E8E93] hover:text-[#F5F5F7]'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-[#F5F5F7]">
                  改行（デフォルト / 推奨）
                </span>
                {enterKeyBehavior === 'newline' && (
                  <span className="text-xs text-[#FF7A45]">選択中</span>
                )}
              </div>
              <p className="text-xs text-[#8E8E93] leading-relaxed">
                <strong className="text-[#D4D4D8]">Enter</strong> で改行、
                <strong className="text-[#D4D4D8]">Shift + Enter</strong> または{' '}
                <strong className="text-[#D4D4D8]">Alt + Enter</strong> で送信
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleEnterKeyBehaviorChange('send')}
              className={`p-3.5 rounded-xl border text-left transition-colors ${
                enterKeyBehavior === 'send'
                  ? 'bg-[#261712] border-[#FF5722] text-[#F5F5F7]'
                  : 'bg-[#18181C] border-white/[0.06] text-[#8E8E93] hover:text-[#F5F5F7]'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-[#F5F5F7]">
                  送信
                </span>
                {enterKeyBehavior === 'send' && (
                  <span className="text-xs text-[#FF7A45]">選択中</span>
                )}
              </div>
              <p className="text-xs text-[#8E8E93] leading-relaxed">
                <strong className="text-[#D4D4D8]">Enter</strong> で送信、
                <strong className="text-[#D4D4D8]">Shift + Enter</strong> または{' '}
                <strong className="text-[#D4D4D8]">Alt + Enter</strong> で改行
              </p>
            </button>
          </div>

          <div className="text-[11px] text-[#636366]">
            ※
            スマートフォン・タブレットでは常に「改行」となり、送信ボタンで送信します。
          </div>
        </section>

        {/* 対象スペース選択 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#8E8E93] mr-2">設定対象スペース:</span>
          {spaces.map((sp) => (
            <button
              key={sp.id}
              type="button"
              onClick={() => setSelectedSpaceId(sp.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                sp.id === activeSpace.id
                  ? 'bg-[#261712] border-[#FF5722] text-[#FF7A45]'
                  : 'bg-[#18181C] border-white/[0.06] text-[#8E8E93] hover:text-[#F5F5F7]'
              }`}
            >
              {sp.name} ({sp.badge})
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* 1. スペース別プロフィール設定 */}
          <section className="rounded-2xl bg-[#131316] border border-white/[0.08] p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#F5F5F7]">
                  スペース別プロフィール
                </h2>
              </div>
              <MemberAvatar avatarType="hima" statusLamp="free" size="lg" />
            </div>
            <p className="text-xs text-[#8E8E93] leading-relaxed">
              1つのアカウントのまま、スペースごとに異なる表示名・自己紹介を使い分けられます。
            </p>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="override-name-input"
                  className="block text-xs text-[#8E8E93] mb-1"
                >
                  「{activeSpace.name}」での表示名
                </label>
                <input
                  id="override-name-input"
                  type="text"
                  value={activeSpace.myOverrideName}
                  onChange={(e) =>
                    handleProfileSave(e.target.value, activeSpace.myOverrideBio)
                  }
                  className="w-full bg-[#18181C] border border-white/10 rounded-xl px-3 py-2 text-sm text-[#F5F5F7]"
                />
              </div>

              <div>
                <label
                  htmlFor="override-bio-input"
                  className="block text-xs text-[#8E8E93] mb-1"
                >
                  「{activeSpace.name}」でのひとこと自己紹介
                </label>
                <input
                  id="override-bio-input"
                  type="text"
                  value={activeSpace.myOverrideBio}
                  onChange={(e) =>
                    handleProfileSave(
                      activeSpace.myOverrideName,
                      e.target.value,
                    )
                  }
                  className="w-full bg-[#18181C] border border-white/10 rounded-xl px-3 py-2 text-sm text-[#F5F5F7]"
                />
              </div>
            </div>
          </section>

          {/* 2. スペース単位のカスタム絵文字管理 */}
          <section className="rounded-2xl bg-[#131316] border border-white/[0.08] p-4 sm:p-5 space-y-4">
            <div>
              <h2 className="text-base font-bold text-[#F5F5F7]">
                カスタム絵文字・スタンプ
              </h2>
              <p className="text-xs text-[#8E8E93] mt-1">
                登録した絵文字はリアクションやメッセージ本文で利用できます。
              </p>
            </div>

            <form
              onSubmit={handleAddEmoji}
              className="grid grid-cols-1 sm:grid-cols-12 gap-2"
            >
              <input
                type="text"
                value={newEmojiChar}
                onChange={(e) => setNewEmojiChar(e.target.value)}
                aria-label="スタンプ絵文字またはシンボル"
                className="sm:col-span-2 bg-[#18181C] border border-white/10 rounded-xl px-2 py-2 text-center text-base"
              />
              <input
                type="text"
                value={newShortcode}
                onChange={(e) => setNewShortcode(e.target.value)}
                placeholder=":stamp:"
                aria-label="ショートコード"
                className="sm:col-span-4 bg-[#18181C] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-[#F5F5F7]"
              />
              <input
                type="text"
                value={newEmojiLabel}
                onChange={(e) => setNewEmojiLabel(e.target.value)}
                placeholder="説明（例: お疲れ様）"
                aria-label="スタンプの説明"
                className="sm:col-span-4 bg-[#18181C] border border-white/10 rounded-xl px-3 py-2 text-xs text-[#F5F5F7]"
              />
              <button
                type="submit"
                className="sm:col-span-2 py-2 px-3 rounded-xl bg-[#FF5722] hover:bg-[#EA580C] text-white text-xs font-semibold transition-colors"
              >
                追加
              </button>
            </form>

            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {customEmojis.map((em) => (
                <div
                  key={em.id}
                  className="p-2.5 rounded-xl bg-[#18181C] border border-white/[0.06] flex items-center gap-2.5"
                >
                  <span className="text-xl w-8 h-8 rounded-lg bg-[#261712] flex items-center justify-center shrink-0">
                    {em.previewChar}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-mono font-semibold text-[#FF7A45] truncate">
                      {em.shortcode}
                    </div>
                    <div className="text-[11px] text-[#8E8E93] truncate">
                      {em.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 3. 暗号鍵の世代更新 */}
          <section className="rounded-2xl bg-[#131316] border border-white/[0.08] p-4 sm:p-5 space-y-3">
            <h2 className="text-base font-bold text-[#F5F5F7]">
              暗号鍵の世代更新
            </h2>
            <p className="text-xs text-[#8E8E93] leading-relaxed">
              メンバーの変更時などに暗号鍵の世代（keyEpoch）を更新し、安全性を維持します。
            </p>
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#18181C] border border-white/[0.06]">
              <div>
                <div className="text-xs text-[#8E8E93]">現在の鍵世代</div>
                <div className="text-sm font-mono font-bold text-[#F5F5F7]">
                  第 {keyEpoch} 世代
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = keyEpoch + 1;
                  setKeyEpoch(next);
                  fetcher.submit(
                    { intent: 'rotateKey', spaceId: activeSpace.id },
                    { method: 'post' },
                  );
                  setSavedBanner(
                    `暗号鍵を更新しました (新世代: 第 ${next} 世代)`,
                  );
                }}
                className="px-3 py-1.5 rounded-xl bg-[#261712] hover:bg-[#FF5722]/25 border border-[#FF5722]/40 text-xs font-semibold text-[#FF7A45] transition-colors"
              >
                🔄 鍵世代を更新
              </button>
            </div>
          </section>

          {/* 4. Inbound Webhook 連携 */}
          <section className="rounded-2xl bg-[#131316] border border-white/[0.08] p-4 sm:p-5 space-y-3">
            <h2 className="text-base font-bold text-[#F5F5F7]">
              外部通知連携 (Webhook)
            </h2>
            <p className="text-xs text-[#8E8E93] leading-relaxed">
              GitHub や CI/CD
              等の外部サービスからチャンネルへ通知を受け取るための Webhook URL
              です。
            </p>
            <div className="p-3 rounded-xl bg-[#18181C] border border-white/[0.06] flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-[#D4D4D8] truncate">
                POST /api/webhooks/{activeWebhookToken}
              </span>
              <button
                type="button"
                onClick={handleTestEncryptedWebhook}
                className="px-3 py-1.5 rounded-lg bg-[#FF5722] hover:bg-[#EA580C] text-white text-xs font-semibold shrink-0 transition-colors"
              >
                ⚡ テスト送信
              </button>
            </div>
            {webhookStatus && (
              <div className="text-xs text-[#22C55E] font-medium">
                {webhookStatus}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
