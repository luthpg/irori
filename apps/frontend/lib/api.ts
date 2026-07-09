import type { AppType } from 'backend';
import { hc } from 'hono/client';

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8787';

export const client = hc<AppType>(BASE_URL);
