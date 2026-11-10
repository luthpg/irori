import { redirect } from 'react-router';
import { clearSessionCookie, isSecureRequest } from '~/lib/auth/session.server';
import type { Route } from './+types/auth.logout';

export async function action({ request }: Route.ActionArgs) {
  const isSecure = isSecureRequest(request);
  return redirect('/welcome', {
    headers: {
      'Set-Cookie': clearSessionCookie(isSecure),
    },
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  const isSecure = isSecureRequest(request);
  return redirect('/welcome', {
    headers: {
      'Set-Cookie': clearSessionCookie(isSecure),
    },
  });
}
