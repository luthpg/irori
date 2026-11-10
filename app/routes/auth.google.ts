import { redirect } from 'react-router';
import { createGoogleAuthorizationUrl } from '~/lib/auth/oauth.server';
import { requireWorkerEnv } from '../../workers/rpc.server';
import type { Route } from './+types/auth.google';

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const returnTo = url.searchParams.get('returnTo') || '/';

  try {
    const env = requireWorkerEnv();
    const { authorizationUrl, stateCookieHeader } =
      await createGoogleAuthorizationUrl({
        env,
        requestUrl: request,
        returnTo,
      });

    return redirect(authorizationUrl, {
      headers: {
        'Set-Cookie': stateCookieHeader,
      },
    });
  } catch {
    return redirect('/welcome?error=oauth_not_configured');
  }
}

export async function action({ request }: Route.ActionArgs) {
  return loader({ request, params: {}, context: {} } as Route.LoaderArgs);
}
