import { useState } from 'react';
import { AsmrController } from '~/components/sidebar/asmr-controller';
import { IroriFlameLogo, MemberAvatar } from '~/components/ui/irori-icons';
import type { MockChannel, MockSpace, NotificationLevel } from '~/lib/schemas';

interface ChannelSidebarProps {
  space: MockSpace;
  activeChannelId: string;
  onSelectChannel: (channelId: string) => void;
  onCreateChannel: (
    name: string,
    isAnonymous: boolean,
    isEphemeral: boolean,
  ) => void;
  onNotificationChange: (level: NotificationLevel) => void;
  onCloseMobile?: () => void;
}

const NOTIFICATION_LABELS: {
  value: NotificationLevel;
  title: string;
  desc: string;
}[] = [
  {
    value: 'all',
    title: 'すべて通知（バナー＋音）',
    desc: '緊急性の高い連絡ルーム向け',
  },
  {
    value: 'mentions',
    title: 'メンション・返信のみ',
    desc: '自分宛ての連絡のみ受け取る標準モード',
  },
  {
    value: 'quiet_glow',
    title: 'サイレント（控えめ表示）',
    desc: 'プッシュ通知や音を出さず、控えめに新着を表示',
  },
  {
    value: 'mute',
    title: '完全ミュート',
    desc: '通知を出さず、開いた時だけ確認',
  },
];

export function ChannelSidebar({
  space,
  activeChannelId,
  onSelectChannel,
  onCreateChannel,
  onNotificationChange,
  onCloseMobile,
}: ChannelSidebarProps) {
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomAnon, setNewRoomAnon] = useState(false);
  const [newRoomEphemeral, setNewRoomEphemeral] = useState(true);

  const renderChannelLeftIcon = (channel: MockChannel) => {
    if (channel.iconType === 'anon-mask') {
      return (
        <div className="w-8 h-8 rounded-full bg-[#2A2A30] flex items-center justify-center shrink-0">
          <svg
            viewBox="0 0 36 36"
            className="w-5 h-5 text-[#D4D4D8]"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M4 11c0-1.1.9-2 2-2h24c1.1 0 2 .9 2 2v5c0 8.8-6.3 16-14 16S4 24.8 4 16v-5zm6.5 4.5c-1.7 0-3 1.1-3 2.5s1.3 2.5 3 2.5 3-1.1 3-2.5-1.3-2.5-3-2.5zm15 0c-1.7 0-3 1.1-3 2.5s1.3 2.5 3 2.5 3-1.1 3-2.5-1.3-2.5-3-2.5zM13 24c1.2 1.8 3 2.8 5 2.8s3.8-1 5-2.8H13z" />
          </svg>
        </div>
      );
    }
    if (channel.iconType === 'tent') {
      return (
        <div className="w-8 h-8 flex items-center justify-center shrink-0 text-xl">
          ⛺
        </div>
      );
    }
    if (channel.iconType === 'book') {
      return (
        <div className="w-8 h-8 flex items-center justify-center shrink-0 text-xl">
          📖
        </div>
      );
    }
    return (
      <span className="w-3 h-3 rounded-full bg-[#22C55E] shrink-0 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
    );
  };

  return (
    <aside
      aria-label="チャンネル一覧サイドバー"
      className="w-[280px] shrink-0 bg-[#131316] border-r border-[#1F1F24] flex flex-col justify-between p-4 select-none relative h-full"
    >
      <div className="flex flex-col min-h-0 flex-1">
        {/* ブランドロゴヘッダー (コンプ画像左上: 🔥 Irori) */}
        <div className="flex items-center justify-between mb-5 px-1">
          <div className="flex items-center gap-2.5">
            <IroriFlameLogo className="w-8 h-8" glowing />
            <span className="text-2xl font-bold tracking-tight text-[#FF7A45]">
              Irori
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#261712] text-[#FF5722] border border-[#FF5722]/30 font-mono">
              E2EE v1
            </span>
            {onCloseMobile && (
              <button
                type="button"
                onClick={onCloseMobile}
                title="サイドバーを閉じる"
                className="md:hidden p-1 rounded-lg text-[#8E8E93] hover:text-[#F5F5F7] hover:bg-[#1F1F24]"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* スペース名 ＆ 4段階通知グラデーション制御ベル */}
        <div className="flex items-center justify-between mb-3 px-1 relative">
          <div className="flex items-baseline gap-2 min-w-0">
            <h2 className="text-lg font-bold text-[#F5F5F7] truncate">
              {space.name}
            </h2>
            <span className="text-xs text-[#8E8E93] shrink-0">
              {space.badge}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowNotifMenu((prev) => !prev)}
            title="4段階の通知グラデーション制御"
            className="relative p-1.5 rounded-lg hover:bg-[#1F1F24] text-[#EA580C] transition-colors"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5 fill-current"
              aria-hidden="true"
            >
              <path d="M12 22a2.5 2.5 0 002.45-2h-4.9A2.5 2.5 0 0012 22zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4a1.5 1.5 0 00-3 0v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
            </svg>
            {space.unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#F59E0B] text-[#0A0A0C] text-[10px] font-bold flex items-center justify-center">
                {space.unreadCount}
              </span>
            )}
          </button>

          {/* 4段階通知グラデーションポップオーバー */}
          {showNotifMenu && (
            <div className="absolute right-0 top-9 z-40 w-64 rounded-xl bg-[#1F1F24] border border-white/10 p-3 shadow-2xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[#F5F5F7]">
                  通知グラデーション設定
                </span>
                <button
                  type="button"
                  onClick={() => setShowNotifMenu(false)}
                  className="text-[11px] text-[#8E8E93] hover:text-[#F5F5F7]"
                >
                  閉じる
                </button>
              </div>
              <div className="space-y-1.5">
                {NOTIFICATION_LABELS.map((item) => {
                  const selected = space.notificationLevel === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => {
                        onNotificationChange(item.value);
                        setShowNotifMenu(false);
                      }}
                      className={`w-full text-left p-2 rounded-lg border transition-colors ${
                        selected
                          ? 'bg-[#261712] border-[#FF5722]/40 text-[#F5F5F7]'
                          : 'bg-[#18181C] border-white/[0.04] text-[#8E8E93] hover:text-[#F5F5F7]'
                      }`}
                    >
                      <div className="text-xs font-medium text-[#F5F5F7]">
                        {item.title}
                      </div>
                      <div className="text-[10px] text-[#8E8E93] mt-0.5">
                        {item.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* スペース別マルチプロフィール簡易表示 */}
        <div className="mb-3 px-2.5 py-2 rounded-lg bg-[#18181C]/70 border border-white/[0.04] flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-[11px] text-[#8E8E93]">
              このスペースでの表示名
            </div>
            <div className="text-xs font-medium text-[#F5F5F7] truncate">
              {space.myOverrideName}
            </div>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-[#1F1F24] text-[#8E8E93] shrink-0">
            定員 {space.maxMembers}名
          </span>
        </div>

        {/* チャンネルカード一覧 (dashboard-design-comp.jpg 準拠) */}
        <div className="space-y-2.5 overflow-y-auto pr-0.5 flex-1">
          {space.channels.map((channel) => {
            const isActive = channel.id === activeChannelId;
            return (
              <button
                key={channel.id}
                type="button"
                onClick={() => {
                  onSelectChannel(channel.id);
                  onCloseMobile?.();
                }}
                className={`w-full text-left rounded-xl p-3 transition-all border relative group ${
                  isActive
                    ? 'bg-[#202026] border-[#FF5722]/35 shadow-[0_4px_20px_rgba(0,0,0,0.4)]'
                    : 'bg-[#18181C] border-white/[0.06] hover:bg-[#1C1C21]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  {/* 左アイコン + チャンネル名 + 完全招待制 */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    {renderChannelLeftIcon(channel)}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 text-sm font-semibold text-[#F5F5F7] truncate">
                        <span className="truncate">{channel.name}</span>
                        <span className="shrink-0 text-xs">
                          {channel.emojis}
                        </span>
                      </div>
                      <div className="text-xs text-[#8E8E93] mt-0.5">
                        {channel.badgeText}
                      </div>
                    </div>
                  </div>

                  {/* 右側: 在室メンバーアバター重なり表示 or 匿名バッジ */}
                  {channel.isAnonymousBadge ? (
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {channel.hasUnreadDot && (
                        <span className="w-2.5 h-2.5 rounded-full bg-[#EA580C]" />
                      )}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#2A2A32] border border-white/10 text-[11px] text-[#D4D4D8]">
                        <span>🎭</span>
                        <span>匿名</span>
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {channel.activeMembers.slice(0, 2).map((mem) => (
                        <div
                          key={mem.memberId}
                          className="flex flex-col items-center"
                        >
                          <MemberAvatar
                            avatarType={mem.avatarType}
                            statusLamp={mem.statusLamp}
                            size="sm"
                          />
                          <span
                            className={`text-[10px] mt-0.5 font-medium ${
                              mem.statusLamp === 'free'
                                ? 'text-[#22C55E]'
                                : mem.statusLamp === 'busy'
                                  ? 'text-[#EF4444]'
                                  : 'text-[#F59E0B]'
                            }`}
                          >
                            {mem.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 下部: 環境音 (ASMR) コントローラー ＆ 新しいルーム作成ボタン */}
      <div className="pt-3 space-y-2.5 border-t border-[#1F1F24] mt-3">
        <AsmrController />

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="w-full py-2.5 px-3 rounded-xl border border-[#FF5722]/45 bg-[#18181C]/60 hover:bg-[#261712] text-[#FF7A45] text-sm font-medium flex items-center justify-center gap-1.5 transition-colors"
        >
          <span className="text-base leading-none">＋</span>
          <span>新しいルームを作成（招待）</span>
        </button>
      </div>

      {/* 新しいルーム作成モーダル */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#1F1F24] border border-white/10 p-5 shadow-2xl">
            <h3 className="text-base font-bold text-[#F5F5F7] mb-1">
              新しいルーム（チャンネル）を作成
            </h3>
            <p className="text-xs text-[#8E8E93] mb-4">
              目的に合わせて「24時間自動消滅」や「日替わりID匿名モード」を設定できます。
            </p>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="new-room-name-input"
                  className="block text-xs text-[#8E8E93] mb-1"
                >
                  ルーム名
                </label>
                <input
                  id="new-room-name-input"
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="例: 夜更かし読書部屋 📚"
                  className="w-full bg-[#131316] border border-white/10 rounded-xl px-3 py-2 text-sm text-[#F5F5F7] placeholder:text-[#636366]"
                />
              </div>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-[#18181C] border border-white/[0.06] cursor-pointer">
                <div>
                  <div className="text-xs font-medium text-[#F5F5F7]">
                    一時チャットモード（24時間自動消去）
                  </div>
                  <div className="text-[11px] text-[#8E8E93]">
                    24時間後に自動でメッセージが消去されます
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={newRoomEphemeral}
                  onChange={(e) => setNewRoomEphemeral(e.target.checked)}
                  className="accent-[#FF5722] w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-[#18181C] border border-white/[0.06] cursor-pointer">
                <div>
                  <div className="text-xs font-medium text-[#F5F5F7]">
                    匿名モード
                  </div>
                  <div className="text-[11px] text-[#8E8E93]">
                    投稿者の名前とアイコンを非表示
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={newRoomAnon}
                  onChange={(e) => setNewRoomAnon(e.target.checked)}
                  className="accent-[#FF5722] w-4 h-4"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-xl bg-[#18181C] text-xs text-[#8E8E93] hover:text-[#F5F5F7]"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => {
                  const trimmed = newRoomName.trim() || '新しいチャンネル';
                  onCreateChannel(trimmed, newRoomAnon, newRoomEphemeral);
                  setNewRoomName('');
                  setShowCreateModal(false);
                }}
                className="px-4 py-2 rounded-xl bg-[#FF5722] hover:bg-[#EA580C] text-white text-xs font-semibold transition-colors"
              >
                ルームを作成する
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
