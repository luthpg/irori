import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { MemberAvatar } from '~/components/ui/irori-icons';
import { resolveInviteKeyFragment } from '~/lib/crypto/e2ee.client';
import type { ChannelSettings, MockChannel } from '~/lib/schemas';

interface ChatHeaderProps {
  spaceId: string;
  keyEpoch?: number;
  wrappedSpaceKey?: string;
  channel: MockChannel;
  isManuallyUnread: boolean;
  isSidebarCollapsed: boolean;
  onToggleSetting: (key: keyof ChannelSettings) => void;
  onToggleManualUnread: () => void;
  onToggleSidebarCollapse: () => void;
  onToggleMobileSidebar?: () => void;
  onOpenDrawer: () => void;
  isDrawerOpen: boolean;
}

const MODE_TOGGLE_ITEMS: {
  key: keyof ChannelSettings;
  label: string;
  description: string;
}[] = [
  {
    key: 'isReadVisible',
    label: '既読',
    description: '既読カウントの表示 ON/OFF',
  },
  {
    key: 'isTypingVisible',
    label: '入力中',
    description: '入力中表示 ON/OFF',
  },
  {
    key: 'isThreadEnabled',
    label: 'スレッド',
    description: 'スレッド返信 ON/OFF',
  },
  {
    key: 'isMentionEnabled',
    label: 'メンション',
    description: 'メンション通知 ON/OFF',
  },
  {
    key: 'isEphemeral',
    label: '一時',
    description: '24時間でメッセージを自動消去',
  },
  {
    key: 'isAnonymousMode',
    label: '匿名',
    description: '匿名モード（名前とアイコンを非表示）',
  },
];

export function ChatHeader({
  spaceId,
  keyEpoch = 1,
  wrappedSpaceKey,
  channel,
  isManuallyUnread,
  isSidebarCollapsed,
  onToggleSetting,
  onToggleManualUnread,
  onToggleSidebarCollapse,
  onToggleMobileSidebar,
  onOpenDrawer,
  isDrawerOpen,
}: ChatHeaderProps) {
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');

  useEffect(() => {
    if (!showInviteModal) return;
    let cancelled = false;
    void (async () => {
      const origin =
        typeof window !== 'undefined' ? window.location.origin : '';
      const frag = await resolveInviteKeyFragment(
        spaceId,
        keyEpoch,
        wrappedSpaceKey,
      );
      if (cancelled) return;
      if (frag) {
        setInviteUrl(`${origin}/join/${spaceId}#key=${frag}`);
      } else {
        setInviteUrl(`${origin}/join/${spaceId}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showInviteModal, spaceId, keyEpoch, wrappedSpaceKey]);

  return (
    <header className="shrink-0 bg-[#0D0D10]/90 backdrop-blur-md border-b border-[#1F1F24] z-10 select-none">
      {/* 上段: チャンネルタイトル・オンライン滞在気配・アクションアイコン群 */}
      <div className="px-3.5 sm:px-5 pt-2.5 sm:pt-3.5 pb-2 sm:pb-2.5 flex items-center justify-between gap-2.5 sm:gap-4">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          {/* サイドバー開閉トグル（モバイルではドロワー展開、デスクトップでは折りたたみ） */}
          <button
            type="button"
            onClick={() => {
              if (
                typeof window !== 'undefined' &&
                window.innerWidth < 768 &&
                onToggleMobileSidebar
              ) {
                onToggleMobileSidebar();
              } else {
                onToggleSidebarCollapse();
              }
            }}
            title={
              isSidebarCollapsed
                ? 'チャンネル一覧サイドバーを展開'
                : 'チャンネル一覧サイドバーを折りたたむ'
            }
            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl bg-[#18181C] hover:bg-[#1F1F24] border border-white/[0.06] text-[#8E8E93] hover:text-[#F5F5F7] transition-colors shrink-0"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 6h16M4 12h10M4 18h16"
              />
            </svg>
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="text-base sm:text-xl font-bold text-[#F5F5F7] truncate">
                {channel.name}
              </h1>
              <span className="text-base shrink-0">{channel.emojis}</span>
              {channel.settings.isEphemeral && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#261712] border border-[#FF5722]/30 text-[11px] text-[#FF7A45]">
                  ⏳ 24h自動消去
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-[#8E8E93]">
                メンバーオンライン {channel.onlineCount}
              </span>

              {/* 在室メンバーのひとことステータスメモ気配 */}
              <div className="hidden lg:flex items-center gap-2">
                {channel.activeMembers
                  .filter((m) => m.ephemeralStatus)
                  .slice(0, 2)
                  .map((m) => (
                    <span
                      key={m.memberId}
                      title={`${m.name}: ${m.ephemeralStatus} (${m.ephemeralExpiresIn})`}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#18181C] border border-white/[0.06] text-[11px] text-[#D4D4D8]"
                    >
                      <MemberAvatar
                        avatarType={m.avatarType}
                        statusLamp={m.statusLamp}
                        size="sm"
                        showStatus={false}
                      />
                      <span className="font-medium text-[#F5F5F7]">
                        {m.name}:
                      </span>
                      <span className="text-[#8E8E93] truncate max-w-[140px]">
                        {m.ephemeralStatus}
                      </span>
                    </span>
                  ))}
              </div>
            </div>
          </div>
        </div>

        {/* 右側アクションアイコン群 (コンプ画像右上準拠: 招待 / 未読戻し / 設定 / メニュー) */}
        <div className="flex items-center gap-2 shrink-0">
          {/* FR-CHAT-09: ワンタップ「未読に戻す」 */}
          <button
            type="button"
            onClick={onToggleManualUnread}
            title="ワンタップで未読状態に戻し、後で自分のペースで返信する"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
              isManuallyUnread
                ? 'bg-[#261712] border-[#FF5722] text-[#FF7A45]'
                : 'bg-[#18181C] border-white/[0.06] text-[#8E8E93] hover:text-[#F5F5F7]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#EA580C]" />
            <span className="hidden sm:inline">
              {isManuallyUnread ? '未読キープ中' : '未読に戻す'}
            </span>
          </button>

          {/* メンバー招待ボタン (コンプ画像 user-plus アイコン) */}
          <button
            type="button"
            onClick={() => setShowInviteModal(true)}
            title="E2EE招待リンク・QRコードを発行"
            className="p-2 rounded-lg text-[#8E8E93] hover:text-[#F5F5F7] hover:bg-[#18181C] transition-colors"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2m8.5-10a4 4 0 100-8 4 4 0 000 8zM20 8v6m3-3h-6"
              />
            </svg>
          </button>

          {/* スペース設定ボタン (コンプ画像 gear アイコン) */}
          <Link
            to="/settings"
            title="スペース設定・カスタム絵文字・マルチプロフィール"
            className="p-2 rounded-lg text-[#8E8E93] hover:text-[#F5F5F7] hover:bg-[#18181C] transition-colors"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </Link>

          {/* 右ペイン（スレッド / ブックマーク）開閉ボタン (コンプ画像 3点リーダー) */}
          <button
            type="button"
            onClick={onOpenDrawer}
            title="右ペイン（スレッド・個人ブックマーク）を開閉"
            className={`p-2 rounded-lg transition-colors ${
              isDrawerOpen
                ? 'bg-[#261712] text-[#FF5722]'
                : 'text-[#8E8E93] hover:text-[#F5F5F7] hover:bg-[#18181C]'
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5"
              fill="currentColor"
              aria-hidden="true"
            >
              <circle cx="12" cy="5" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="12" cy="19" r="1.8" />
            </svg>
          </button>
        </div>
      </div>

      {/* 下段: DESIGN.md 5.1 & コンプ画像準拠「空気感トグルピル群（全6項目）」 */}
      <div className="px-3.5 sm:px-5 py-2 border-t border-[#1F1F24] flex items-center gap-2.5 sm:gap-3 overflow-x-auto scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none]">
        {MODE_TOGGLE_ITEMS.map((item) => {
          const isOn = channel.settings[item.key];
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onToggleSetting(item.key)}
              title={item.description}
              className="min-h-[28px] inline-flex items-center gap-1.5 text-xs shrink-0 group py-0.5 px-1 rounded-lg hover:bg-white/[0.03]"
            >
              <span className="text-[#D4D4D8] group-hover:text-white transition-colors">
                {item.label} :
              </span>
              <span
                className={`h-6 px-2.5 rounded-full text-xs font-semibold inline-flex items-center justify-center transition-all ${
                  isOn
                    ? 'bg-[#EA580C] text-white shadow-[0_0_10px_rgba(234,88,12,0.4)]'
                    : 'bg-[#1F1F24] text-[#8E8E93] border border-white/[0.06] group-hover:text-[#D4D4D8]'
                }`}
              >
                {isOn ? 'ON' : 'OFF'}
              </span>
            </button>
          );
        })}
      </div>

      {/* メンバー招待モーダル */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#1F1F24] border border-white/10 p-5 shadow-2xl">
            <h3 className="text-base font-bold text-[#F5F5F7] mb-1">
              「{channel.name}」へメンバーを招待
            </h3>
            <p className="text-xs text-[#8E8E93] mb-4">
              安全な招待リンクを発行します。リンクを共有したい相手に送信してください。
            </p>
            <div className="p-3 rounded-xl bg-[#131316] border border-white/10 font-mono text-xs text-[#D4D4D8] break-all mb-4">
              {inviteUrl || '招待URLを生成中...'}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="px-4 py-2 rounded-xl bg-[#18181C] text-xs text-[#8E8E93] hover:text-[#F5F5F7]"
              >
                閉じる
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (
                    inviteUrl &&
                    typeof navigator !== 'undefined' &&
                    navigator.clipboard
                  ) {
                    try {
                      await navigator.clipboard.writeText(inviteUrl);
                    } catch {
                      // clipboard fallback ignored
                    }
                  }
                  setCopiedInvite(true);
                  window.setTimeout(() => setCopiedInvite(false), 2000);
                }}
                className="px-4 py-2 rounded-xl bg-[#FF5722] hover:bg-[#EA580C] text-white text-xs font-semibold transition-colors"
              >
                {copiedInvite ? 'コピーしました ✓' : '招待リンクをコピー'}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
