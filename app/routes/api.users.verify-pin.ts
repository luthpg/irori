import { requireAuth } from '~/lib/auth/session.server';
import { callUserActor } from '../../workers/rpc.server';
import type { Route } from './+types/api.users.verify-pin';

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
  }

  const { session, rollingSetCookie } = await requireAuth(request, {
    isApi: true,
  });

  try {
    const body = (await request.json()) as { pinAuthHash?: string };

    if (!body.pinAuthHash) {
      return Response.json(
        { error: 'pinAuthHash is required' },
        { status: 400 },
      );
    }

    const result = await callUserActor<{
      ok: boolean;
      isLocked: boolean;
      remainingAttempts: number;
      lockedUntil?: string | null;
      pinSalt?: string;
      encryptedBackupUserKey?: string | null;
      serverPepperToken?: string;
    }>(session.userId, 'unlockBackupVault', {
      pinAuthHash: body.pinAuthHash,
    });

    const headers = rollingSetCookie
      ? { 'Set-Cookie': rollingSetCookie }
      : undefined;

    if (!result.ok) {
      return Response.json(
        {
          error: 'Too many failed attempts or invalid PIN.',
          isLocked: result.isLocked,
          remainingAttempts: result.remainingAttempts,
          lockedUntil: result.lockedUntil ?? null,
        },
        { status: 403, headers },
      );
    }

    return Response.json(
      {
        encryptedBackupUserKey: result.encryptedBackupUserKey,
        pinSalt: result.pinSalt,
        serverPepperToken: result.serverPepperToken,
        remainingAttempts: result.remainingAttempts,
      },
      { headers },
    );
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
