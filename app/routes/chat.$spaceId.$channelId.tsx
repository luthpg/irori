import { useCallback, useEffect, useState } from 'react';
import { redirect, useFetcher, useNavigate } from 'react-router';
import { ChatHeader } from '~/components/chat/chat-header';
import { ChatInput } from '~/components/chat/chat-input';
import { ChatTimeline } from '~/components/chat/chat-timeline';
import { ThreadDrawer } from '~/components/context/thread-drawer';
import { AppShell } from '~/components/layout/app-shell';
import { MobileBottomBar } from '~/components/layout/mobile-bottom-bar';
import { ChannelSidebar } from '~/components/sidebar/channel-sidebar';
import { NarrowRail } from '~/components/sidebar/narrow-rail';
import { IroriFlameLogo } from '~/components/ui/irori-icons';
import { useSpaceWebSocket } from '~/hooks/useSpaceWebSocket';
import { type AuthSession, requireAuth } from '~/lib/auth/session.server';
import {
  ensureLocalIdentityKeys,
  importSpaceMasterKeyFromFragment,
} from '~/lib/crypto/e2ee.client';
import {
  decryptFromSpace,
  decryptPersonalNote,
  encryptForSpace,
  encryptPersonalNote,
} from '~/lib/crypto/envelope.client';
import { ENTER_KEY_STORAGE_KEY } from '~/lib/keyboard';
import type {
  BookmarkEntity,
  ChannelEntity,
  ChannelSettings,
  EnterKeyBehavior,
  InsertMessageDTO,
  JoinedSpaceSummary,
  MediaAttachment,
  MessageEntity,
  MockBookmark,
  MockChannel,
  MockMessage,
  MockSpace,
  MockThreadReply,
  NotificationLevel,
  ServerToClientWsEvent,
  SpaceMetaEntity,
  StatusLamp,
  UserProfileEntity,
  WorkflowCardData,
} from '~/lib/schemas';
import { checkRateLimit } from '../../workers/rate-limit.server';
import { callSpaceActor, callUserActor } from '../../workers/rpc.server';
import type { Route } from './+types/chat.$spaceId.$channelId';

export function meta({ params }: Route.MetaArgs) {
  return [
    {
      title: `Irori — ${params.channelId || 'チャット'}`,
    },
    {
      name: 'description',
      content: 'ゼロ知識E2EEで守られたプライベート・チャット',
    },
  ];
}

interface ServerBootstrapData {
  session: AuthSession;
  spaceId: string;
  channelId: string;
  joinedSpaces: JoinedSpaceSummary[];
  spaceMeta: SpaceMetaEntity;
  channels: ChannelEntity[];
  encryptedMessages: MessageEntity[];
  encryptedBookmarks: BookmarkEntity[];
  userProfile: UserProfileEntity;
  myMemberProfile: {
    overrideName: string;
    overrideBio: string;
    wrappedSpaceKey: string;
  };
}

export async function loader({
  params,
  request,
}: Route.LoaderArgs): Promise<ServerBootstrapData | Response> {
  const spaceId = params.spaceId || '';
  const channelId = params.channelId || 'takibi';
  const { session, rollingSetCookie } = await requireAuth(request);

  if (!spaceId) {
    throw redirect('/');
  }

  const [spaceBootstrap, userProfile, bookmarks, joinedSpaces] =
    await Promise.all([
      callSpaceActor<{
        exists: boolean;
        spaceMeta: SpaceMetaEntity;
        channels: ChannelEntity[];
        activeChannelId: string;
        messages: MessageEntity[];
        myMemberProfile: {
          overrideName: string;
          overrideBio: string;
          wrappedSpaceKey: string;
        };
      }>(spaceId, 'getBootstrap', {
        channelId,
        memberId: session.memberId,
      }),
      callUserActor<UserProfileEntity>(session.userId, 'getProfile'),
      callUserActor<BookmarkEntity[]>(session.userId, 'getBookmarks'),
      callUserActor<JoinedSpaceSummary[]>(session.userId, 'getJoinedSpaces'),
    ]);

  if (!spaceBootstrap.exists || spaceBootstrap.channels.length === 0) {
    throw redirect('/', {
      headers: rollingSetCookie
        ? { 'Set-Cookie': rollingSetCookie }
        : undefined,
    });
  }

  return {
    session,
    spaceId,
    channelId: spaceBootstrap.activeChannelId || channelId,
    joinedSpaces,
    spaceMeta: spaceBootstrap.spaceMeta,
    channels: spaceBootstrap.channels,
    encryptedMessages: spaceBootstrap.messages,
    encryptedBookmarks: bookmarks,
    userProfile,
    myMemberProfile: spaceBootstrap.myMemberProfile,
  };
}

/**
 * plan.api.md 3.1 & NFR-ARCH-04:
 * clientLoader (hydrate = true) によるクライアントサイド透過一括復号
 * SpaceActor / UserActor の SQLite に保存された暗号文を IndexedDB 内の秘密鍵で復号してから UI へ渡す。
 */
export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  const serverData = (await serverLoader()) as ServerBootstrapData;
  await ensureLocalIdentityKeys();

  if (typeof window !== 'undefined' && window.location.hash) {
    const rawHash = window.location.hash.replace(/^#/, '');
    const hashParams = new URLSearchParams(
      rawHash.includes('=') ? rawHash : `key=${rawHash}`,
    );
    const keyFragment = hashParams.get('key');
    if (keyFragment) {
      try {
        await importSpaceMasterKeyFromFragment(
          serverData.spaceId,
          keyFragment,
          serverData.spaceMeta.currentKeyEpoch || 1,
        );
      } catch {
        // invalid fragment ignored
      }
    }
  }

  const myMemberId = serverData.session.memberId;
  const decryptedParentMessages: MockMessage[] = [];
  const decryptedThreadMap: Record<string, MockThreadReply[]> = {};

  for (const m of serverData.encryptedMessages) {
    const plaintext = await decryptFromSpace(
      m.ciphertext,
      m.iv,
      serverData.spaceId,
      m.keyEpoch,
    );

    if (m.parentMessageId) {
      const list = decryptedThreadMap[m.parentMessageId] ?? [];
      list.push({
        id: m.id,
        parentMessageId: m.parentMessageId,
        senderName: m.senderName,
        avatarType: m.avatarType,
        isOwn: m.senderMemberId === myMemberId,
        content: plaintext,
        timestamp: m.createdAt,
      });
      decryptedThreadMap[m.parentMessageId] = list;
    } else {
      let media: MediaAttachment | undefined;
      let workflow: WorkflowCardData | undefined;

      if (m.mediaPayloadEncrypted) {
        try {
          const mediaJson = await decryptFromSpace(
            m.mediaPayloadEncrypted,
            m.iv,
            serverData.spaceId,
            m.keyEpoch,
          );
          media = JSON.parse(mediaJson) as MediaAttachment;
        } catch {
          media = undefined;
        }
      }

      if (m.workflowPayloadEncrypted) {
        try {
          const wfJson = await decryptFromSpace(
            m.workflowPayloadEncrypted,
            m.iv,
            serverData.spaceId,
            m.keyEpoch,
          );
          workflow = JSON.parse(wfJson) as WorkflowCardData;
        } catch {
          workflow = undefined;
        }
      }

      decryptedParentMessages.push({
        id: m.id,
        channelId: m.channelId,
        senderMemberId: m.senderMemberId,
        senderName: m.senderName,
        anonymousId: `匿名イロリ #${m.senderMemberId.slice(-4).toUpperCase()}`,
        avatarType: m.avatarType,
        statusLamp: m.statusLamp,
        isOwn: m.senderMemberId === myMemberId,
        content: plaintext,
        timestamp: m.createdAt,
        readCount: m.readCount,
        isEdited: m.isEdited,
        keyEpoch: m.keyEpoch,
        expiresIn: m.expiresAt ?? undefined,
        deliveryMode: m.deliveryMode,
        media,
        workflow,
        reactions: m.reactions.map((r) => ({
          emojiCode: r.emojiCode,
          count: r.count,
          me: r.memberIds.includes(myMemberId),
        })),
        threadCount: m.threadCount,
      });
    }
  }

  const decryptedBookmarks: MockBookmark[] = [];
  for (const bm of serverData.encryptedBookmarks) {
    const excerpt = await decryptPersonalNote(
      bm.encryptedMessageSnapshot,
      bm.iv,
    );
    const note = await decryptPersonalNote(bm.encryptedPrivateNote, bm.iv);
    decryptedBookmarks.push({
      id: bm.id,
      messageId: bm.messageId,
      channelName: bm.channelName,
      senderName: bm.senderName,
      messageExcerpt: excerpt,
      privateNote: note,
      tags: bm.tags,
      createdAt: bm.createdAt,
    });
  }

  return {
    ...serverData,
    decryptedParentMessages,
    decryptedThreadMap,
    decryptedBookmarks,
  };
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
  return (
    <div className="h-screen w-screen bg-[#0A0A0C] text-[#F5F5F7] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <IroriFlameLogo className="w-8 h-8 animate-pulse" glowing />
        <span className="text-xs text-[#8E8E93] font-medium">
          読み込み中...
        </span>
      </div>
    </div>
  );
}

/**
 * plan.api.md 3.1: Server Action
 * クライアントで暗号化済みの ciphertext / iv のみを受け取り、SpaceActor / UserActor 内蔵 SQLite に永続化する。
 */
export async function action({ params, request }: Route.ActionArgs) {
  const spaceId = params.spaceId || '';
  const { session } = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get('intent') || '');

  switch (intent) {
    case 'postMessage': {
      const rate = checkRateLimit(`msg_post:${session.userId}`, {
        limit: 45,
        windowMs: 60_000,
      });
      if (!rate.allowed) {
        return Response.json(
          {
            ok: false,
            error: 'Too Many Requests: Message rate limit exceeded',
          },
          {
            status: 429,
            headers: { 'Retry-After': String(rate.retryAfterSeconds) },
          },
        );
      }

      const deliveryMode =
        formData.get('deliveryMode') === 'when_free' ? 'when_free' : 'instant';
      const channelId = String(formData.get('channelId') || 'takibi');
      const ciphertext = String(formData.get('ciphertext') || '');
      const iv = String(formData.get('iv') || '');

      if (deliveryMode === 'when_free') {
        await callUserActor(session.userId, 'queuePendingDelivery', {
          spaceId,
          channelId,
          ciphertext,
          iv,
          triggerType: 'when_free',
        });
      }

      const dto: InsertMessageDTO = {
        id: String(formData.get('messageId') || ''),
        channelId,
        parentMessageId: formData.get('parentMessageId')
          ? String(formData.get('parentMessageId'))
          : null,
        senderMemberId: session.memberId,
        senderName: String(formData.get('senderName') || session.defaultName),
        avatarType: 'hima',
        statusLamp: (formData.get('statusLamp') as StatusLamp | null) || 'free',
        ciphertext,
        iv,
        keyEpoch: Number(formData.get('keyEpoch') || 1),
        workflowType:
          (formData.get('workflowType') as InsertMessageDTO['workflowType']) ||
          null,
        workflowPayloadEncrypted: formData.get('workflowPayloadEncrypted')
          ? String(formData.get('workflowPayloadEncrypted'))
          : null,
        mediaPayloadEncrypted: formData.get('mediaPayloadEncrypted')
          ? String(formData.get('mediaPayloadEncrypted'))
          : null,
        mediaR2Key: formData.get('mediaR2Key')
          ? String(formData.get('mediaR2Key'))
          : null,
        deliveryMode,
      };
      const saved = await callSpaceActor<MessageEntity>(
        spaceId,
        'postMessage',
        { data: dto },
      );
      return Response.json({ ok: true, message: saved });
    }

    case 'editMessage': {
      const ok = await callSpaceActor<{ ok: boolean }>(spaceId, 'editMessage', {
        messageId: String(formData.get('messageId')),
        ciphertext: String(formData.get('ciphertext')),
        iv: String(formData.get('iv')),
      });
      return Response.json(ok);
    }

    case 'deleteMessage': {
      const ok = await callSpaceActor<{ ok: boolean }>(
        spaceId,
        'deleteMessage',
        {
          messageId: String(formData.get('messageId')),
        },
      );
      return Response.json(ok);
    }

    case 'toggleReaction': {
      const res = await callSpaceActor<{ reactions: unknown[] }>(
        spaceId,
        'toggleReaction',
        {
          channelId: String(formData.get('channelId')),
          messageId: String(formData.get('messageId')),
          memberId: session.memberId,
          emojiCode: String(formData.get('emojiCode')),
        },
      );
      return Response.json(res);
    }

    case 'updateChannelSettings': {
      const settingsJson = String(formData.get('settings') || '{}');
      const settings = JSON.parse(settingsJson) as Partial<ChannelSettings>;
      const res = await callSpaceActor<{ settings: ChannelSettings }>(
        spaceId,
        'updateChannelSettings',
        {
          channelId: String(formData.get('channelId')),
          settings,
        },
      );
      return Response.json(res);
    }

    case 'createChannel': {
      const created = await callSpaceActor<ChannelEntity>(
        spaceId,
        'createChannel',
        {
          name: String(formData.get('name') || '新しいチャンネル'),
          isAnonymous: formData.get('isAnonymous') === 'true',
          isEphemeral: formData.get('isEphemeral') === 'true',
        },
      );
      return Response.json({ ok: true, channel: created });
    }

    case 'updateStatus': {
      const updated = await callUserActor<UserProfileEntity>(
        session.userId,
        'updateStatusLamp',
        {
          statusLamp: String(formData.get('statusLamp') || 'free'),
          ephemeralMemo: formData.get('ephemeralMemo')
            ? String(formData.get('ephemeralMemo'))
            : undefined,
        },
      );
      return Response.json({ ok: true, profile: updated });
    }

    case 'updateEnterKeyBehavior': {
      const enterKeyBehavior: EnterKeyBehavior =
        formData.get('enterKeyBehavior') === 'send' ? 'send' : 'newline';
      const updated = await callUserActor<UserProfileEntity>(
        session.userId,
        'updateEnterKeyBehavior',
        { enterKeyBehavior },
      );
      return Response.json({ ok: true, profile: updated });
    }

    case 'addBookmark': {
      const created = await callUserActor<BookmarkEntity>(
        session.userId,
        'addBookmark',
        {
          data: {
            spaceId,
            channelId: String(formData.get('channelId')),
            channelName: String(formData.get('channelName')),
            messageId: String(formData.get('messageId')),
            senderName: String(formData.get('senderName')),
            encryptedMessageSnapshot: String(
              formData.get('encryptedMessageSnapshot'),
            ),
            encryptedPrivateNote: String(formData.get('encryptedPrivateNote')),
            iv: String(formData.get('iv')),
            tags: ['お気に入り', 'E2EE個人メモ'],
          },
        },
      );
      return Response.json({ ok: true, bookmark: created });
    }

    case 'updateBookmarkNote': {
      const res = await callUserActor<{ ok: boolean }>(
        session.userId,
        'updateBookmarkNote',
        {
          bookmarkId: String(formData.get('bookmarkId')),
          encryptedPrivateNote: String(formData.get('encryptedPrivateNote')),
          iv: String(formData.get('iv')),
        },
      );
      return Response.json(res);
    }

    case 'deleteBookmark': {
      const res = await callUserActor<{ ok: boolean }>(
        session.userId,
        'deleteBookmark',
        {
          bookmarkId: String(formData.get('bookmarkId')),
        },
      );
      return Response.json(res);
    }

    default:
      return Response.json({ ok: false }, { status: 400 });
  }
}

function buildSpacesFromBootstrap(params: {
  spaceId: string;
  spaceMeta: SpaceMetaEntity;
  channels: ChannelEntity[];
  joinedSpaces: JoinedSpaceSummary[];
  myMemberId: string;
  myOverrideName: string;
  myOverrideBio: string;
  myStatusLamp: StatusLamp;
  myEphemeralMemo: string;
}): MockSpace[] {
  const {
    spaceId,
    spaceMeta,
    channels,
    joinedSpaces,
    myMemberId,
    myOverrideName,
    myOverrideBio,
    myStatusLamp,
    myEphemeralMemo,
  } = params;

  const mapChannels = (targetSpaceId: string): MockChannel[] => {
    if (targetSpaceId === spaceId && channels.length > 0) {
      return channels.map((hc) => ({
        id: hc.id,
        spaceId: hc.spaceId,
        name: hc.name,
        emojis: hc.emojis,
        badgeText: hc.badgeText,
        iconType: hc.iconType,
        isAnonymousBadge: hc.settings.isAnonymousMode,
        onlineCount: 1,
        heatLevel: 0.5,
        pinnedTopic: {
          title: `${hc.name} のお題カード 📌`,
          description:
            'ゼロ知識E2EEで守られた空間です。自分のペースで言葉を置いていってください。',
          updatedAt: '今日',
          commentCount: 0,
        },
        settings: hc.settings,
        activeMembers: [
          {
            memberId: myMemberId,
            name: myOverrideName,
            avatarType: 'hima',
            statusLamp: myStatusLamp,
            ephemeralStatus: myEphemeralMemo,
            role: 'admin',
          },
        ],
      }));
    }

    return [
      {
        id: 'takibi',
        spaceId: targetSpaceId,
        name: '焚き火と雑談',
        emojis: '🔥 👥',
        badgeText: '完全招待制',
        iconType: 'green-dot',
        onlineCount: 1,
        heatLevel: 0.45,
        pinnedTopic: {
          title: '焚き火と雑談 📌',
          description: '自分のペースで言葉を置いていってください。',
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
    ];
  };

  const baseSummaries: JoinedSpaceSummary[] =
    joinedSpaces.length > 0
      ? joinedSpaces
      : [
          {
            spaceId,
            spaceName: spaceMeta.name,
            themeColor: spaceMeta.themeColor,
            role: 'admin',
            unreadCount: 0,
            hasQuietActivity: true,
            notificationLevel: 'mentions',
          },
        ];

  if (!baseSummaries.some((s) => s.spaceId === spaceId)) {
    baseSummaries.unshift({
      spaceId,
      spaceName: spaceMeta.name,
      themeColor: spaceMeta.themeColor,
      role: 'admin',
      unreadCount: 0,
      hasQuietActivity: true,
      notificationLevel: 'mentions',
    });
  }

  return baseSummaries.map((js) => ({
    id: js.spaceId,
    name: js.spaceId === spaceId ? spaceMeta.name : js.spaceName,
    badge: js.spaceId === spaceId ? spaceMeta.badge : '完全招待制',
    iconType: js.spaceId === spaceId ? spaceMeta.iconType : 'flame',
    themeColor: js.spaceId === spaceId ? spaceMeta.themeColor : js.themeColor,
    unreadCount: js.unreadCount,
    hasQuietActivity: js.hasQuietActivity,
    heatLevel: 0.65,
    maxMembers: js.spaceId === spaceId ? spaceMeta.maxMembers : 6,
    memberCount: 1,
    notificationLevel: js.notificationLevel,
    myOverrideName,
    myOverrideAvatar: 'hima',
    myOverrideBio,
    channels: mapChannels(js.spaceId),
  }));
}

export function IroriChatDashboard({
  initialSpaceId,
  initialChannelId,
  session,
  spaceMeta,
  joinedSpaces = [],
  myMemberProfile,
  hydratedMessages = [],
  hydratedThreadMap = {},
  hydratedBookmarks = [],
  hydratedChannels = [],
  hydratedUserProfile,
}: {
  initialSpaceId: string;
  initialChannelId: string;
  session: AuthSession;
  spaceMeta: SpaceMetaEntity;
  joinedSpaces?: JoinedSpaceSummary[];
  myMemberProfile: {
    overrideName: string;
    overrideBio: string;
    wrappedSpaceKey?: string;
  };
  hydratedMessages?: MockMessage[];
  hydratedThreadMap?: Record<string, MockThreadReply[]>;
  hydratedBookmarks?: MockBookmark[];
  hydratedChannels?: ChannelEntity[];
  hydratedUserProfile: UserProfileEntity;
}) {
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const [myStatusLamp, setMyStatusLamp] = useState<StatusLamp>(
    hydratedUserProfile?.statusLamp ?? 'off',
  );
  const [myEphemeralMemo, setMyEphemeralMemo] = useState(
    hydratedUserProfile?.ephemeralMemo ?? '',
  );
  const [enterKeyBehavior, setEnterKeyBehavior] = useState<EnterKeyBehavior>(
    hydratedUserProfile?.enterKeyBehavior || 'newline',
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(ENTER_KEY_STORAGE_KEY);
    if (saved === 'send' || saved === 'newline') {
      setEnterKeyBehavior(saved);
    }
  }, []);

  const [spaces, setSpaces] = useState<MockSpace[]>(() =>
    buildSpacesFromBootstrap({
      spaceId: initialSpaceId,
      spaceMeta,
      channels: hydratedChannels ?? [],
      joinedSpaces: joinedSpaces ?? [],
      myMemberId: session.memberId,
      myOverrideName: myMemberProfile.overrideName || session.defaultName,
      myOverrideBio: myMemberProfile.overrideBio,
      myStatusLamp: hydratedUserProfile?.statusLamp ?? 'off',
      myEphemeralMemo: hydratedUserProfile?.ephemeralMemo ?? '',
    }),
  );
  const [activeSpaceId, setActiveSpaceId] = useState<string>(initialSpaceId);
  const [activeChannelId, setActiveChannelId] =
    useState<string>(initialChannelId);

  const [messagesByChannel, setMessagesByChannel] = useState<
    Record<string, MockMessage[]>
  >(() => ({
    [initialChannelId]: hydratedMessages ?? [],
  }));

  const [threadRepliesByMsg, setThreadRepliesByMsg] = useState<
    Record<string, MockThreadReply[]>
  >(() => hydratedThreadMap ?? {});

  const [bookmarks, setBookmarks] = useState<MockBookmark[]>(
    () => hydratedBookmarks ?? [],
  );

  const [manualUnreadChannels, setManualUnreadChannels] = useState<
    Record<string, boolean>
  >({});

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'thread' | 'bookmarks'>('thread');
  const [activeThreadMsgId, setActiveThreadMsgId] = useState<string | null>(
    hydratedMessages?.[0]?.id ?? null,
  );
  const [manualSidebarCollapsed, setManualSidebarCollapsed] = useState<
    boolean | null
  >(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  useEffect(() => {
    setActiveSpaceId(initialSpaceId);
    setActiveChannelId(initialChannelId);
    setSpaces(
      buildSpacesFromBootstrap({
        spaceId: initialSpaceId,
        spaceMeta,
        channels: hydratedChannels ?? [],
        joinedSpaces: joinedSpaces ?? [],
        myMemberId: session.memberId,
        myOverrideName: myMemberProfile.overrideName || session.defaultName,
        myOverrideBio: myMemberProfile.overrideBio,
        myStatusLamp,
        myEphemeralMemo,
      }),
    );
  }, [
    initialSpaceId,
    initialChannelId,
    spaceMeta,
    hydratedChannels,
    joinedSpaces,
    session.memberId,
    session.defaultName,
    myMemberProfile.overrideName,
    myMemberProfile.overrideBio,
    myStatusLamp,
    myEphemeralMemo,
  ]);

  useEffect(() => {
    setMessagesByChannel((prev) => ({
      ...prev,
      [initialChannelId]: hydratedMessages ?? [],
    }));
  }, [hydratedMessages, initialChannelId]);

  useEffect(() => {
    setThreadRepliesByMsg(hydratedThreadMap ?? {});
  }, [hydratedThreadMap]);

  useEffect(() => {
    setBookmarks(hydratedBookmarks ?? []);
  }, [hydratedBookmarks]);

  const currentSpace = spaces.find((s) => s.id === activeSpaceId) ?? spaces[0];
  const currentChannel =
    currentSpace.channels.find((c) => c.id === activeChannelId) ??
    currentSpace.channels[0];

  const isSingleRoomSpace = currentSpace.channels.length === 1;
  const isSidebarCollapsed =
    manualSidebarCollapsed != null ? manualSidebarCollapsed : isSingleRoomSpace;

  const currentMessages = messagesByChannel[currentChannel.id] ?? [];

  // SpaceActor WebSocket からのリアルタイムブロードキャスト受信＆クライアント復号
  const handleWsServerEvent = useCallback(
    async (event: ServerToClientWsEvent) => {
      if (event.type === 'NEW_MESSAGE') {
        const m = event.data;
        const plaintext = await decryptFromSpace(
          m.ciphertext,
          m.iv,
          activeSpaceId,
          m.keyEpoch,
        );

        if (m.parentMessageId) {
          setThreadRepliesByMsg((prev) => {
            const list = prev[m.parentMessageId as string] ?? [];
            if (list.some((item) => item.id === m.id)) return prev;
            return {
              ...prev,
              [m.parentMessageId as string]: [
                ...list,
                {
                  id: m.id,
                  parentMessageId: m.parentMessageId as string,
                  senderName: m.senderName,
                  avatarType: m.avatarType,
                  isOwn: m.senderMemberId === session.memberId,
                  content: plaintext,
                  timestamp: m.createdAt,
                },
              ],
            };
          });
          return;
        }

        setMessagesByChannel((prev) => {
          const list = prev[m.channelId] ?? [];
          if (list.some((item) => item.id === m.id)) return prev;
          const nextMsg: MockMessage = {
            id: m.id,
            channelId: m.channelId,
            senderMemberId: m.senderMemberId,
            senderName: m.senderName,
            anonymousId: `匿名イロリ #${m.senderMemberId.slice(-4).toUpperCase()}`,
            avatarType: m.avatarType,
            statusLamp: m.statusLamp,
            isOwn: m.senderMemberId === session.memberId,
            content: plaintext,
            timestamp: m.createdAt,
            readCount: m.readCount,
            keyEpoch: m.keyEpoch,
            deliveryMode: m.deliveryMode,
            reactions: [],
          };
          return {
            ...prev,
            [m.channelId]: [...list, nextMsg],
          };
        });
      } else if (event.type === 'MESSAGE_EDIT') {
        const { id, channelId, ciphertext, iv } = event.data;
        const plaintext = await decryptFromSpace(
          ciphertext,
          iv,
          activeSpaceId,
          1,
        );
        setMessagesByChannel((prev) => ({
          ...prev,
          [channelId]: (prev[channelId] ?? []).map((msg) =>
            msg.id === id
              ? { ...msg, content: plaintext, isEdited: true }
              : msg,
          ),
        }));
      } else if (event.type === 'MESSAGE_DELETE') {
        const { id, channelId } = event.data;
        setMessagesByChannel((prev) => ({
          ...prev,
          [channelId]: (prev[channelId] ?? []).filter((msg) => msg.id !== id),
        }));
      } else if (event.type === 'SETTING_TOGGLE') {
        const { channelId, settings } = event.data;
        setSpaces((prev) =>
          prev.map((sp) => ({
            ...sp,
            channels: sp.channels.map((ch) =>
              ch.id === channelId ? { ...ch, settings } : ch,
            ),
          })),
        );
      }
    },
    [activeSpaceId, session.memberId],
  );

  const { heatLevel, typingUsers, setManualHeatBoost } = useSpaceWebSocket({
    spaceId: currentSpace.id,
    channelId: currentChannel.id,
    memberId: session.memberId,
    baseHeatLevel: currentChannel.heatLevel,
    isTypingVisible: currentChannel.settings.isTypingVisible,
    onServerEvent: handleWsServerEvent,
  });

  const submitToAction = (fields: Record<string, string>) => {
    fetcher.submit(fields, {
      method: 'post',
      action: `/chat/${currentSpace.id}/${currentChannel.id}`,
    });
  };

  const handleSelectSpace = (spaceId: string) => {
    const nextSpace = spaces.find((s) => s.id === spaceId);
    if (!nextSpace) return;
    const firstChannel = nextSpace.channels[0];
    setActiveSpaceId(spaceId);
    setActiveChannelId(firstChannel.id);
    setManualSidebarCollapsed(null);
    navigate(`/chat/${spaceId}/${firstChannel.id}`);
  };

  const handleSelectChannel = (channelId: string) => {
    setActiveChannelId(channelId);
    navigate(`/chat/${currentSpace.id}/${channelId}`);
  };

  const handleToggleSetting = (key: keyof ChannelSettings) => {
    const nextSettings: ChannelSettings = {
      ...currentChannel.settings,
      [key]: !currentChannel.settings[key],
    };

    setSpaces((prev) =>
      prev.map((sp) => {
        if (sp.id !== currentSpace.id) return sp;
        return {
          ...sp,
          channels: sp.channels.map((ch) =>
            ch.id === currentChannel.id
              ? { ...ch, settings: nextSettings }
              : ch,
          ),
        };
      }),
    );

    submitToAction({
      intent: 'updateChannelSettings',
      channelId: currentChannel.id,
      settings: JSON.stringify(nextSettings),
    });
  };

  const handleCreateChannel = (
    name: string,
    isAnonymous: boolean,
    isEphemeral: boolean,
  ) => {
    const newId = `room-${Date.now()}`;
    const newChannel: MockChannel = {
      id: newId,
      spaceId: currentSpace.id,
      name,
      emojis: isAnonymous ? '🤫 👥' : '🔥 👥',
      badgeText: '完全招待制',
      iconType: isAnonymous ? 'anon-mask' : 'green-dot',
      isAnonymousBadge: isAnonymous,
      onlineCount: 1,
      heatLevel: 0.35,
      pinnedTopic: {
        title: `${name} 📌`,
        description: '新しく作られたチャンネルです。',
        updatedAt: 'たった今',
        commentCount: 0,
      },
      settings: {
        isReadVisible: !isAnonymous,
        isTypingVisible: !isAnonymous,
        isThreadEnabled: true,
        isMentionEnabled: true,
        isEphemeral,
        isAnonymousMode: isAnonymous,
      },
      activeMembers: [
        {
          memberId: session.memberId,
          name: currentSpace.myOverrideName,
          avatarType: 'hima',
          statusLamp: myStatusLamp,
          ephemeralStatus: myEphemeralMemo,
          role: 'admin',
        },
      ],
    };

    setSpaces((prev) =>
      prev.map((sp) =>
        sp.id === currentSpace.id
          ? { ...sp, channels: [...sp.channels, newChannel] }
          : sp,
      ),
    );
    setMessagesByChannel((prev) => ({
      ...prev,
      [newId]: [],
    }));

    submitToAction({
      intent: 'createChannel',
      name,
      isAnonymous: String(isAnonymous),
      isEphemeral: String(isEphemeral),
    });

    setActiveChannelId(newId);
    setManualSidebarCollapsed(false);
  };

  const handleNotificationChange = (level: NotificationLevel) => {
    setSpaces((prev) =>
      prev.map((sp) =>
        sp.id === currentSpace.id ? { ...sp, notificationLevel: level } : sp,
      ),
    );
  };

  const handleSendMessage = async ({
    content,
    deliveryMode,
    media,
    workflow,
  }: {
    content: string;
    deliveryMode: 'instant' | 'when_free';
    media?: MediaAttachment;
    workflow?: WorkflowCardData;
  }) => {
    const msgId = `msg_${Date.now()}`;
    const nowStr = new Date().toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const newMsg: MockMessage = {
      id: msgId,
      channelId: currentChannel.id,
      senderMemberId: session.memberId,
      senderName: currentSpace.myOverrideName,
      anonymousId: `匿名イロリ #${session.memberId.slice(-4).toUpperCase()}`,
      avatarType: 'hima',
      statusLamp: myStatusLamp,
      isOwn: true,
      content,
      timestamp: nowStr,
      readCount: 1,
      keyEpoch: spaceMeta.currentKeyEpoch || 1,
      deliveryMode,
      media,
      workflow,
      reactions: [],
    };

    setMessagesByChannel((prev) => ({
      ...prev,
      [currentChannel.id]: [...(prev[currentChannel.id] ?? []), newMsg],
    }));
    setManualHeatBoost(0.12);

    const epoch = spaceMeta.currentKeyEpoch || 1;
    const encrypted = await encryptForSpace(content, currentSpace.id, epoch);
    const wfEncrypted = workflow
      ? (
          await encryptForSpace(
            JSON.stringify(workflow),
            currentSpace.id,
            epoch,
          )
        ).ciphertext
      : '';
    const mediaEncrypted = media
      ? (await encryptForSpace(JSON.stringify(media), currentSpace.id, epoch))
          .ciphertext
      : '';

    submitToAction({
      intent: 'postMessage',
      messageId: msgId,
      channelId: currentChannel.id,
      senderName: currentSpace.myOverrideName,
      statusLamp: myStatusLamp,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      keyEpoch: String(epoch),
      workflowType: workflow?.type ?? '',
      workflowPayloadEncrypted: wfEncrypted,
      mediaPayloadEncrypted: mediaEncrypted,
      mediaR2Key: media?.r2Key ?? '',
      deliveryMode,
    });
  };

  const handleToggleReaction = (messageId: string, emojiCode: string) => {
    setMessagesByChannel((prev) => {
      const list = prev[currentChannel.id] ?? [];
      return {
        ...prev,
        [currentChannel.id]: list.map((msg) => {
          if (msg.id !== messageId) return msg;
          const existing = msg.reactions.find((r) => r.emojiCode === emojiCode);
          if (existing) {
            const nextCount = existing.me
              ? existing.count - 1
              : existing.count + 1;
            const nextReactions =
              nextCount <= 0
                ? msg.reactions.filter((r) => r.emojiCode !== emojiCode)
                : msg.reactions.map((r) =>
                    r.emojiCode === emojiCode
                      ? { ...r, count: nextCount, me: !existing.me }
                      : r,
                  );
            return { ...msg, reactions: nextReactions };
          }
          return {
            ...msg,
            reactions: [...msg.reactions, { emojiCode, count: 1, me: true }],
          };
        }),
      };
    });

    submitToAction({
      intent: 'toggleReaction',
      channelId: currentChannel.id,
      messageId,
      emojiCode,
    });
  };

  const handleEditMessage = async (messageId: string, newContent: string) => {
    setMessagesByChannel((prev) => ({
      ...prev,
      [currentChannel.id]: (prev[currentChannel.id] ?? []).map((msg) =>
        msg.id === messageId
          ? { ...msg, content: newContent, isEdited: true }
          : msg,
      ),
    }));

    const encrypted = await encryptForSpace(
      newContent,
      currentSpace.id,
      spaceMeta.currentKeyEpoch || 1,
    );
    submitToAction({
      intent: 'editMessage',
      messageId,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
    });
  };

  const handleDeleteMessage = (messageId: string) => {
    setMessagesByChannel((prev) => ({
      ...prev,
      [currentChannel.id]: (prev[currentChannel.id] ?? []).filter(
        (msg) => msg.id !== messageId,
      ),
    }));

    submitToAction({
      intent: 'deleteMessage',
      messageId,
    });
  };

  const handleVoteWorkflow = (
    messageId: string,
    optionId: string,
    vote: 'yes' | 'maybe' | 'no',
  ) => {
    setMessagesByChannel((prev) => ({
      ...prev,
      [currentChannel.id]: (prev[currentChannel.id] ?? []).map((msg) => {
        if (msg.id !== messageId || !msg.workflow?.options) return msg;
        return {
          ...msg,
          workflow: {
            ...msg.workflow,
            options: msg.workflow.options.map((opt) => {
              if (opt.id !== optionId) return opt;
              const wasYes = opt.myVote === 'yes';
              const wasMaybe = opt.myVote === 'maybe';
              return {
                ...opt,
                myVote: vote,
                yesCount:
                  vote === 'yes'
                    ? wasYes
                      ? opt.yesCount
                      : opt.yesCount + 1
                    : wasYes
                      ? Math.max(0, opt.yesCount - 1)
                      : opt.yesCount,
                maybeCount:
                  vote === 'maybe'
                    ? wasMaybe
                      ? opt.maybeCount
                      : opt.maybeCount + 1
                    : wasMaybe
                      ? Math.max(0, opt.maybeCount - 1)
                      : opt.maybeCount,
              };
            }),
          },
        };
      }),
    }));
  };

  const handleOpenThread = (messageId: string) => {
    setActiveThreadMsgId(messageId);
    setDrawerTab('thread');
    setIsDrawerOpen(true);
  };

  const handleAddBookmark = async (message: MockMessage) => {
    const existing = bookmarks.find((b) => b.messageId === message.id);
    if (!existing) {
      const defaultNote =
        '自分専用の非公開メモ（個人の暗号鍵で保護され、共有チャット欄には一切表示されません）';
      const newBm: MockBookmark = {
        id: `bm_${Date.now()}`,
        messageId: message.id,
        channelName: `${currentChannel.name} 🔥`,
        senderName: message.senderName,
        messageExcerpt: message.content.slice(0, 60),
        privateNote: defaultNote,
        tags: ['お気に入り', 'E2EE個人メモ'],
        createdAt: 'たった今',
      };
      setBookmarks((prev) => [newBm, ...prev]);

      const encSnap = await encryptPersonalNote(message.content.slice(0, 60));
      const encNote = await encryptPersonalNote(defaultNote);
      submitToAction({
        intent: 'addBookmark',
        channelId: currentChannel.id,
        channelName: `${currentChannel.name} 🔥`,
        messageId: message.id,
        senderName: message.senderName,
        encryptedMessageSnapshot: encSnap.ciphertext,
        encryptedPrivateNote: encNote.ciphertext,
        iv: encNote.iv,
      });
    }
    setDrawerTab('bookmarks');
    setIsDrawerOpen(true);
  };

  const handleSendThreadReply = async (content: string) => {
    if (!activeThreadMsgId) return;
    const replyId = `th_${Date.now()}`;
    const nowStr = new Date().toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const newReply: MockThreadReply = {
      id: replyId,
      parentMessageId: activeThreadMsgId,
      senderName: currentSpace.myOverrideName,
      avatarType: 'hima',
      isOwn: true,
      content,
      timestamp: nowStr,
    };
    setThreadRepliesByMsg((prev) => ({
      ...prev,
      [activeThreadMsgId]: [...(prev[activeThreadMsgId] ?? []), newReply],
    }));
    setMessagesByChannel((prev) => ({
      ...prev,
      [currentChannel.id]: (prev[currentChannel.id] ?? []).map((m) =>
        m.id === activeThreadMsgId
          ? { ...m, threadCount: (m.threadCount ?? 0) + 1 }
          : m,
      ),
    }));

    const epoch = spaceMeta.currentKeyEpoch || 1;
    const encrypted = await encryptForSpace(content, currentSpace.id, epoch);
    submitToAction({
      intent: 'postMessage',
      messageId: replyId,
      channelId: currentChannel.id,
      parentMessageId: activeThreadMsgId,
      senderName: currentSpace.myOverrideName,
      statusLamp: myStatusLamp,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      keyEpoch: String(epoch),
      deliveryMode: 'instant',
    });
  };

  const activeParentMessage =
    currentMessages.find((m) => m.id === activeThreadMsgId) ??
    currentMessages[0] ??
    null;

  return (
    <AppShell
      narrowRail={
        <NarrowRail
          spaces={spaces}
          activeSpaceId={currentSpace.id}
          onSelectSpace={handleSelectSpace}
          onOpenBookmarksDrawer={() => {
            setDrawerTab('bookmarks');
            setIsDrawerOpen((prev) =>
              drawerTab === 'bookmarks' ? !prev : true,
            );
          }}
          isBookmarksDrawerOpen={isDrawerOpen && drawerTab === 'bookmarks'}
          bookmarkCount={bookmarks.length}
          myStatusLamp={myStatusLamp}
          myEphemeralMemo={myEphemeralMemo}
          onStatusChange={(nextStatus) => {
            setMyStatusLamp(nextStatus);
            submitToAction({
              intent: 'updateStatus',
              statusLamp: nextStatus,
              ephemeralMemo: myEphemeralMemo,
            });
          }}
          onMemoChange={(nextMemo) => {
            setMyEphemeralMemo(nextMemo);
            submitToAction({
              intent: 'updateStatus',
              statusLamp: myStatusLamp,
              ephemeralMemo: nextMemo,
            });
          }}
        />
      }
      channelSidebar={
        !isSidebarCollapsed || isMobileSidebarOpen ? (
          <ChannelSidebar
            space={currentSpace}
            activeChannelId={currentChannel.id}
            onSelectChannel={handleSelectChannel}
            onCreateChannel={handleCreateChannel}
            onNotificationChange={handleNotificationChange}
            onCloseMobile={() => setIsMobileSidebarOpen(false)}
          />
        ) : undefined
      }
      mainTimeline={
        <>
          <ChatHeader
            spaceId={currentSpace.id}
            keyEpoch={spaceMeta.currentKeyEpoch || 1}
            wrappedSpaceKey={myMemberProfile.wrappedSpaceKey}
            channel={currentChannel}
            isManuallyUnread={Boolean(manualUnreadChannels[currentChannel.id])}
            isSidebarCollapsed={isSidebarCollapsed}
            onToggleSetting={handleToggleSetting}
            onToggleManualUnread={() =>
              setManualUnreadChannels((prev) => ({
                ...prev,
                [currentChannel.id]: !prev[currentChannel.id],
              }))
            }
            onToggleSidebarCollapse={() =>
              setManualSidebarCollapsed(!isSidebarCollapsed)
            }
            onToggleMobileSidebar={() =>
              setIsMobileSidebarOpen((prev) => !prev)
            }
            onOpenDrawer={() => setIsDrawerOpen((prev) => !prev)}
            isDrawerOpen={isDrawerOpen}
          />
          <ChatTimeline
            channel={currentChannel}
            messages={currentMessages}
            heatLevel={heatLevel}
            typingUsers={typingUsers}
            isManuallyUnread={Boolean(manualUnreadChannels[currentChannel.id])}
            onToggleReaction={handleToggleReaction}
            onOpenThread={handleOpenThread}
            onAddBookmark={handleAddBookmark}
            onEditMessage={handleEditMessage}
            onDeleteMessage={handleDeleteMessage}
            onVoteWorkflow={handleVoteWorkflow}
          />
          <ChatInput
            spaceId={currentSpace.id}
            channelName={currentChannel.name}
            isAnonymousMode={currentChannel.settings.isAnonymousMode}
            enterKeyBehavior={enterKeyBehavior}
            onEnterKeyBehaviorChange={(next) => {
              setEnterKeyBehavior(next);
              if (typeof window !== 'undefined') {
                window.localStorage.setItem(ENTER_KEY_STORAGE_KEY, next);
              }
              submitToAction({
                intent: 'updateEnterKeyBehavior',
                enterKeyBehavior: next,
              });
            }}
            onSendMessage={handleSendMessage}
          />
        </>
      }
      contextDrawer={
        <ThreadDrawer
          isOpen={isDrawerOpen}
          activeTab={drawerTab}
          onTabChange={setDrawerTab}
          onClose={() => setIsDrawerOpen(false)}
          parentMessage={activeParentMessage}
          threadReplies={
            activeParentMessage
              ? (threadRepliesByMsg[activeParentMessage.id] ?? [])
              : []
          }
          onSendThreadReply={handleSendThreadReply}
          enterKeyBehavior={enterKeyBehavior}
          bookmarks={bookmarks}
          onUpdateBookmarkNote={async (id, note) => {
            setBookmarks((prev) =>
              prev.map((b) => (b.id === id ? { ...b, privateNote: note } : b)),
            );
            const enc = await encryptPersonalNote(note);
            submitToAction({
              intent: 'updateBookmarkNote',
              bookmarkId: id,
              encryptedPrivateNote: enc.ciphertext,
              iv: enc.iv,
            });
          }}
          onDeleteBookmark={(id) => {
            setBookmarks((prev) => prev.filter((b) => b.id !== id));
            submitToAction({
              intent: 'deleteBookmark',
              bookmarkId: id,
            });
          }}
        />
      }
      mobileBottomBar={
        <MobileBottomBar
          onToggleMobileChannels={() => setIsMobileSidebarOpen((prev) => !prev)}
          onOpenBookmarks={() => {
            setDrawerTab('bookmarks');
            setIsDrawerOpen(true);
            setIsMobileSidebarOpen(false);
          }}
          bookmarkCount={bookmarks.length}
          isMobileChannelsOpen={isMobileSidebarOpen}
          isBookmarksOpen={isDrawerOpen && drawerTab === 'bookmarks'}
        />
      }
      isMobileSidebarOpen={isMobileSidebarOpen}
      onCloseMobileSidebar={() => setIsMobileSidebarOpen(false)}
    />
  );
}

export default function ChatSpaceChannelRoute({
  loaderData,
}: Route.ComponentProps) {
  const data = loaderData as Partial<Awaited<ReturnType<typeof clientLoader>>>;
  if (!data?.session || !data.spaceMeta) {
    return <HydrateFallback />;
  }
  return (
    <IroriChatDashboard
      initialSpaceId={data.spaceId || ''}
      initialChannelId={data.channelId || ''}
      session={data.session}
      spaceMeta={data.spaceMeta}
      joinedSpaces={data.joinedSpaces ?? []}
      myMemberProfile={
        data.myMemberProfile ?? { overrideName: '', overrideBio: '' }
      }
      hydratedMessages={data.decryptedParentMessages ?? []}
      hydratedThreadMap={data.decryptedThreadMap ?? {}}
      hydratedBookmarks={data.decryptedBookmarks ?? []}
      hydratedChannels={data.channels ?? []}
      hydratedUserProfile={
        data.userProfile ?? {
          userId: data.session.userId,
          defaultName: data.session.defaultName,
          defaultAvatar: 'kenta',
          statusLamp: 'free',
          ephemeralMemo: '',
          enterKeyBehavior: 'newline',
          publicKey: '',
          encryptedBackupUserKey: null,
          pinSalt: '',
          failedPinAttempts: 0,
          pinLockedUntil: null,
        }
      }
    />
  );
}
