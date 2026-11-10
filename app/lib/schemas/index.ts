export type StatusLamp = 'free' | 'busy' | 'away';

export type NotificationLevel = 'all' | 'mentions' | 'quiet_glow' | 'mute';

export type EnterKeyBehavior = 'newline' | 'send';

export type WorkflowType = 'schedule' | 'poll' | 'todo' | 'focus_timer' | null;

export interface ChannelSettings {
  isReadVisible: boolean;
  isTypingVisible: boolean;
  isThreadEnabled: boolean;
  isMentionEnabled: boolean;
  isAnonymousMode: boolean;
  isEphemeral: boolean;
}

export interface SpaceMetaEntity {
  id: string;
  name: string;
  badge: string;
  iconType: 'flame' | 'users' | 'chat' | 'book';
  themeColor: 'amber' | 'blue' | 'emerald';
  ambientSound: 'campfire' | 'rain' | 'waves';
  maxMembers: number;
  autoCloseHours: number | null;
  currentKeyEpoch: number;
}

export interface SpaceMemberEntity {
  memberId: string;
  userId: string;
  role: 'admin' | 'member';
  overrideName: string;
  overrideAvatar: 'kenta' | 'sayuri' | 'hima' | 'sakyo' | 'anon';
  overrideBio: string;
  statusLamp: StatusLamp;
  ephemeralStatusEncrypted: string | null;
  ephemeralStatusExpiresAt: string | null;
  wrappedSpaceKey: string;
}

export interface ChannelEntity {
  id: string;
  spaceId: string;
  name: string;
  emojis: string;
  badgeText: string;
  iconType: 'green-dot' | 'anon-mask' | 'tent' | 'book';
  sortOrder: number;
  pinnedTopicEncrypted: string;
  settings: ChannelSettings;
}

export interface ReactionSummary {
  emojiCode: string;
  count: number;
  memberIds: string[];
}

export interface MessageEntity {
  id: string;
  channelId: string;
  parentMessageId: string | null;
  senderMemberId: string;
  senderName: string;
  avatarType: 'kenta' | 'sayuri' | 'hima' | 'sakyo' | 'anon';
  statusLamp: StatusLamp;
  ciphertext: string;
  iv: string;
  keyEpoch: number;
  workflowType: WorkflowType;
  workflowPayloadEncrypted: string | null;
  mediaPayloadEncrypted: string | null;
  mediaR2Key?: string | null;
  deliveryMode: 'instant' | 'when_free';
  expiresAt: string | null;
  isEdited: boolean;
  readCount: number;
  createdAt: string;
  updatedAt: string;
  reactions: ReactionSummary[];
  threadCount: number;
}

export interface CustomEmojiEntity {
  id: string;
  name: string;
  shortcode: string;
  label: string;
  previewChar: string;
  imageUrl: string;
  uploadedByMemberId: string;
  createdAt: string;
}

export interface SharedNoteEntity {
  id: string;
  channelId: string;
  titleEncrypted: string;
  bodyEncrypted: string;
  iv: string;
  isPinned: boolean;
  updatedAt: string;
}

export interface UserProfileEntity {
  userId: string;
  defaultName: string;
  defaultAvatar: string;
  statusLamp: StatusLamp;
  ephemeralMemo: string;
  enterKeyBehavior: EnterKeyBehavior;
  publicKey: string;
  encryptedBackupUserKey: string | null;
  pinSalt: string;
  failedPinAttempts: number;
  pinLockedUntil: string | null;
}

export interface BookmarkEntity {
  id: string;
  spaceId: string;
  channelId: string;
  channelName: string;
  messageId: string;
  senderName: string;
  encryptedMessageSnapshot: string;
  encryptedPrivateNote: string;
  iv: string;
  tags: string[];
  createdAt: string;
}

export interface PendingDeliveryEntity {
  id: string;
  targetUserId: string;
  spaceId: string;
  channelId: string;
  ciphertext: string;
  iv: string;
  triggerType: 'time' | 'when_free';
  scheduledAt: string | null;
  createdAt: string;
}

export interface JoinedSpaceSummary {
  spaceId: string;
  spaceName: string;
  themeColor: 'amber' | 'blue' | 'emerald';
  role: 'admin' | 'member';
  unreadCount: number;
  hasQuietActivity: boolean;
  notificationLevel: NotificationLevel;
}

export interface CreateSpaceDTO {
  spaceId: string;
  name: string;
  badge?: string;
  iconType?: 'flame' | 'users' | 'chat' | 'book';
  themeColor?: 'amber' | 'blue' | 'emerald';
  maxMembers?: number;
  autoCloseHours?: number | null;
  creatorUserId: string;
  creatorMemberId: string;
  creatorName: string;
  wrappedSpaceKey: string;
  initialChannelName?: string;
}

export interface JoinSpaceMemberDTO {
  memberId: string;
  userId: string;
  overrideName: string;
  overrideAvatar?: 'kenta' | 'sayuri' | 'hima' | 'sakyo' | 'anon';
  overrideBio?: string;
  wrappedSpaceKey: string;
}

export interface InsertMessageDTO {
  id?: string;
  channelId: string;
  parentMessageId?: string | null;
  senderMemberId: string;
  senderName: string;
  avatarType: 'kenta' | 'sayuri' | 'hima' | 'sakyo' | 'anon';
  statusLamp: StatusLamp;
  ciphertext: string;
  iv: string;
  keyEpoch: number;
  workflowType?: WorkflowType;
  workflowPayloadEncrypted?: string | null;
  mediaPayloadEncrypted?: string | null;
  mediaR2Key?: string | null;
  deliveryMode?: 'instant' | 'when_free';
  expiresAt?: string | null;
}

export interface InsertBookmarkDTO {
  spaceId: string;
  channelId: string;
  channelName: string;
  messageId: string;
  senderName: string;
  encryptedMessageSnapshot: string;
  encryptedPrivateNote: string;
  iv: string;
  tags: string[];
}

export type ClientToServerWsEvent =
  | {
      type: 'TYPING_UPDATE';
      channelId: string;
      memberName: string;
      isTyping: boolean;
    }
  | {
      type: 'PRESENCE_PING';
      channelId: string;
      memberId: string;
    }
  | {
      type: 'SEND_MESSAGE';
      payload: InsertMessageDTO;
    }
  | {
      type: 'TOGGLE_REACTION';
      channelId: string;
      messageId: string;
      memberId: string;
      emojiCode: string;
    };

export type ServerToClientWsEvent =
  | {
      type: 'NEW_MESSAGE';
      data: MessageEntity;
    }
  | {
      type: 'MESSAGE_EDIT';
      data: {
        id: string;
        channelId: string;
        ciphertext: string;
        iv: string;
        updatedAt: string;
      };
    }
  | {
      type: 'MESSAGE_DELETE';
      data: {
        id: string;
        channelId: string;
      };
    }
  | {
      type: 'REACTION_UPDATE';
      data: {
        channelId: string;
        messageId: string;
        reactions: ReactionSummary[];
      };
    }
  | {
      type: 'PRESENCE_STATE';
      data: {
        channelId: string;
        onlineCount: number;
        heatLevel: number;
        typingUsers: string[];
      };
    }
  | {
      type: 'SETTING_TOGGLE';
      data: {
        channelId: string;
        settings: ChannelSettings;
      };
    };

export interface WebhookEntity {
  token: string;
  spaceId: string;
  channelId: string;
  label: string;
  createdByMemberId: string;
  createdAt: string;
}

export interface QrSyncSessionEntity {
  sessionId: string;
  userId: string;
  ephemeralPublicKey: string;
  senderPublicKey: string | null;
  encryptedKeyBundle: string | null;
  iv: string | null;
  status: 'pending' | 'approved' | 'expired';
  expiresAt: string;
}

export interface MemberPresence {
  memberId: string;
  name: string;
  avatarType: 'kenta' | 'sayuri' | 'hima' | 'sakyo' | 'anon';
  statusLamp: StatusLamp;
  ephemeralStatus?: string;
  ephemeralExpiresIn?: string;
  role: 'admin' | 'member';
}

export interface ReactionItem {
  emojiCode: string;
  label?: string;
  count: number;
  me: boolean;
}

export interface MediaAttachment {
  provider: string;
  title: string;
  subtitle: string;
  thumbnailType: 'campfire' | 'lounge';
  r2Key?: string;
  iv?: string;
}

export interface WorkflowCardData {
  type: 'schedule' | 'poll' | 'todo' | 'focus_timer';
  title: string;
  options?: {
    id: string;
    label: string;
    yesCount: number;
    maybeCount: number;
    noCount: number;
    myVote?: 'yes' | 'maybe' | 'no';
  }[];
  todos?: {
    id: string;
    text: string;
    done: boolean;
  }[];
  timerMinutes?: number;
}

export interface MockMessage {
  id: string;
  channelId: string;
  senderMemberId: string;
  senderName: string;
  anonymousId: string;
  avatarType: 'kenta' | 'sayuri' | 'hima' | 'sakyo' | 'anon';
  statusLamp: StatusLamp;
  isOwn: boolean;
  content: string;
  timestamp: string;
  readCount?: number;
  isEdited?: boolean;
  keyEpoch: number;
  expiresIn?: string;
  deliveryMode?: 'instant' | 'when_free' | 'scheduled';
  media?: MediaAttachment;
  workflow?: WorkflowCardData;
  reactions: ReactionItem[];
  threadCount?: number;
}

export interface MockThreadReply {
  id: string;
  parentMessageId: string;
  senderName: string;
  avatarType: 'kenta' | 'sayuri' | 'hima' | 'sakyo' | 'anon';
  isOwn: boolean;
  content: string;
  timestamp: string;
}

export interface MockBookmark {
  id: string;
  messageId: string;
  channelName: string;
  senderName: string;
  messageExcerpt: string;
  privateNote: string;
  tags: string[];
  createdAt: string;
}

export interface MockChannel {
  id: string;
  spaceId: string;
  name: string;
  emojis: string;
  badgeText: string;
  iconType: 'green-dot' | 'anon-mask' | 'tent' | 'book';
  isAnonymousBadge?: boolean;
  hasUnreadDot?: boolean;
  onlineCount: number;
  heatLevel: number;
  pinnedTopic: {
    title: string;
    description: string;
    updatedAt: string;
    commentCount: number;
  };
  settings: ChannelSettings;
  activeMembers: MemberPresence[];
}

export interface MockSpace {
  id: string;
  name: string;
  badge: string;
  iconType: 'flame' | 'users' | 'chat' | 'book';
  themeColor: 'amber' | 'blue' | 'emerald';
  unreadCount: number;
  hasQuietActivity: boolean;
  heatLevel: number;
  maxMembers: number;
  notificationLevel: NotificationLevel;
  myOverrideName: string;
  myOverrideBio: string;
  channels: MockChannel[];
}

export interface CustomEmojiItem {
  id: string;
  shortcode: string;
  label: string;
  previewChar: string;
  uploadedBy: string;
  createdAt: string;
}
