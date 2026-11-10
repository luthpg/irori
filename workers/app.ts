import { createRequestHandler } from 'react-router';
import { verifySessionFromRequest } from '~/lib/auth/session.server';
import { SpaceActor } from './actors/space.actor';
import { UserActor } from './actors/user.actor';
import { checkRateLimit } from './rate-limit.server';
import {
  type DurableObjectNamespaceLike,
  type IroriWorkerEnv,
  setWorkerEnv,
} from './rpc.server';

const requestHandler = createRequestHandler(
  () => import('virtual:react-router/server-build'),
  import.meta.env.MODE,
);

export class ChatRoom extends SpaceActor {}
export { SpaceActor, UserActor };

export default {
  async fetch(request: Request, env: IroriWorkerEnv, _ctx: unknown) {
    setWorkerEnv(env);

    const url = new URL(request.url);
    // plan.api.md 4.1: GET /ws/spaces/:spaceId WebSocket Upgrade ハンドシェイクを SpaceActor へ直接ルーティング
    if (url.pathname.startsWith('/ws/spaces/')) {
      const session = await verifySessionFromRequest(request);
      if (!session) {
        return Response.json(
          { error: 'Unauthorized: Valid session required for WebSocket' },
          { status: 401 },
        );
      }

      const rate = checkRateLimit(`ws_connect:${session.userId}`, {
        limit: 20,
        windowMs: 60_000,
      });
      if (!rate.allowed) {
        return Response.json(
          {
            error:
              'Too Many Requests: WebSocket connection rate limit exceeded',
          },
          {
            status: 429,
            headers: { 'Retry-After': String(rate.retryAfterSeconds) },
          },
        );
      }

      const segments = url.pathname.split('/');
      const spaceId = segments[3];
      if (!spaceId) {
        return Response.json(
          { error: 'Bad Request: Missing spaceId' },
          { status: 400 },
        );
      }

      const headers = new Headers(request.headers);
      headers.set('X-Irori-Space-Id', spaceId);
      headers.set('X-Irori-User-Id', session.userId);
      headers.set('X-Irori-Member-Id', session.memberId);
      headers.set('X-Irori-Role', session.role);

      const authedRequest = new Request(request.url, {
        method: request.method,
        headers,
      });

      const ns = env.SPACE_ACTOR as DurableObjectNamespaceLike;
      const id = ns.idFromName(spaceId);
      return ns.get(id).fetch(authedRequest);
    }

    return requestHandler(request);
  },
};
