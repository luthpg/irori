import { requireAuth } from '~/lib/auth/session.server';
import type { StatusLamp, UserProfileEntity } from '~/lib/schemas';
import { callUserActor } from '../../workers/rpc.server';
import type { Route } from './+types/api.users.status';

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== 'PATCH' && request.method !== 'POST') {
    return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
  }

  const { session, rollingSetCookie } = await requireAuth(request, {
    isApi: true,
  });

  try {
    const body = (await request.json()) as {
      statusLamp?: StatusLamp;
      ephemeralMemo?: string;
    };

    const statusLamp: StatusLamp =
      body.statusLamp === 'busy' || body.statusLamp === 'away'
        ? body.statusLamp
        : 'free';

    const updated = await callUserActor<UserProfileEntity>(
      session.userId,
      'updateStatusLamp',
      {
        statusLamp,
        ephemeralMemo: body.ephemeralMemo,
      },
    );

    return Response.json(
      { success: true, profile: updated },
      {
        headers: rollingSetCookie
          ? { 'Set-Cookie': rollingSetCookie }
          : undefined,
      },
    );
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
