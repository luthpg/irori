import { requireAuth } from '~/lib/auth/session.server';
import { callUserActor } from '../../workers/rpc.server';
import type { Route } from './+types/api.users.backup-vault';

export async function loader({ request }: Route.LoaderArgs) {
  const { session, rollingSetCookie } = await requireAuth(request, {
    isApi: true,
  });
  const challenge = await callUserActor<{
    pinSalt: string;
    isLocked: boolean;
    remainingAttempts: number;
    lockedUntil: string | null;
    hasBackupVault: boolean;
  }>(session.userId, 'getPinChallenge');

  const headers = rollingSetCookie
    ? { 'Set-Cookie': rollingSetCookie }
    : undefined;

  if (challenge.isLocked) {
    return Response.json(
      {
        error:
          'Account is temporarily locked due to too many failed PIN attempts.',
        ...challenge,
      },
      { status: 403, headers },
    );
  }
  return Response.json(challenge, { headers });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
  }

  const { session, rollingSetCookie } = await requireAuth(request, {
    isApi: true,
  });

  try {
    const body = (await request.json()) as {
      encryptedBackupUserKey?: string;
      pinSalt?: string;
      pinAuthHash?: string;
    };

    if (!body.encryptedBackupUserKey || !body.pinSalt || !body.pinAuthHash) {
      return Response.json(
        { error: 'Missing required vault fields' },
        { status: 400 },
      );
    }

    const result = await callUserActor<{
      success: boolean;
      serverPepperToken: string;
    }>(session.userId, 'setBackupVault', {
      encryptedBackupUserKey: body.encryptedBackupUserKey,
      pinSalt: body.pinSalt,
      pinAuthHash: body.pinAuthHash,
    });

    return Response.json(result, {
      headers: rollingSetCookie
        ? { 'Set-Cookie': rollingSetCookie }
        : undefined,
    });
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
