import { requireAuth } from '~/lib/auth/session.server';
import type { UserProfileEntity } from '~/lib/schemas';
import { callUserActor } from '../../workers/rpc.server';
import type { Route } from './+types/api.users.me';

export async function loader({ request }: Route.LoaderArgs) {
  const { session, rollingSetCookie } = await requireAuth(request, {
    isApi: true,
  });
  const profile = await callUserActor<UserProfileEntity>(
    session.userId,
    'getProfile',
  );
  return Response.json(profile, {
    headers: rollingSetCookie ? { 'Set-Cookie': rollingSetCookie } : undefined,
  });
}
