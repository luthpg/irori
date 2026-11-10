import { index, type RouteConfig, route } from '@react-router/dev/routes';

export default [
  index('routes/_index.tsx'),
  route('welcome', 'routes/welcome.tsx'),
  route('auth/google', 'routes/auth.google.ts'),
  route('auth/google/callback', 'routes/auth.google.callback.ts'),
  route('auth/logout', 'routes/auth.logout.ts'),
  route('join/:spaceId', 'routes/join.$spaceId.tsx'),
  route('chat/:spaceId/:channelId', 'routes/chat.$spaceId.$channelId.tsx'),
  route('restore-key', 'routes/restore-key.tsx'),
  route('settings', 'routes/settings.tsx'),
  route('api/users/me', 'routes/api.users.me.ts'),
  route('api/users/status', 'routes/api.users.status.ts'),
  route('api/users/backup-vault', 'routes/api.users.backup-vault.ts'),
  route('api/users/verify-pin', 'routes/api.users.verify-pin.ts'),
  route('api/users/qr-sync', 'routes/api.users.qr-sync.ts'),
  route('api/spaces/:spaceId/emojis', 'routes/api.spaces.$spaceId.emojis.ts'),
  route('api/media/:key', 'routes/api.media.$key.ts'),
  route('api/webhooks/:token', 'routes/api.webhooks.$token.ts'),
] satisfies RouteConfig;
