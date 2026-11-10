import { redirect } from 'react-router';
import {
  clearOAuthStateCookie,
  exchangeGoogleCodeForUser,
} from '~/lib/auth/oauth.server';
import {
  createSignedSessionCookie,
  isSecureRequest,
} from '~/lib/auth/session.server';
import type { UserProfileEntity } from '~/lib/schemas';
import { callUserActor, requireWorkerEnv } from '../../workers/rpc.server';
import type { Route } from './+types/auth.google.callback';

export async function loader({ request }: Route.LoaderArgs) {
  const isSecure = isSecureRequest(request);

  try {
    const env = requireWorkerEnv();
    const { user, returnTo } = await exchangeGoogleCodeForUser({
      env,
      request,
    });

    const sanitizedSub = user.sub.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
    const userId = `user_${sanitizedSub}`;
    const memberId = `mem_${sanitizedSub.slice(0, 16)}`;

    const profile = await callUserActor<UserProfileEntity>(
      userId,
      'upsertOAuthUser',
      {
        googleSub: user.sub,
        defaultName: user.name,
        defaultAvatar: 'hima',
      },
    );

    const sessionCookie = await createSignedSessionCookie(
      {
        userId: profile.userId,
        memberId,
        defaultName: profile.defaultName,
        role: 'admin',
      },
      { isSecure },
    );

    const headers = new Headers();
    headers.append('Set-Cookie', clearOAuthStateCookie(isSecure));
    headers.append('Set-Cookie', sessionCookie);

    return redirect(returnTo, { headers });
  } catch {
    return redirect('/welcome?error=oauth_callback_failed', {
      headers: {
        'Set-Cookie': clearOAuthStateCookie(isSecure),
      },
    });
  }
}
