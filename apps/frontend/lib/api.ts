import type { AppType } from 'backend';
import { hc } from 'hono/client';
import { env } from '@/env';

const BASE_URL = env.NEXT_PUBLIC_API_BASE_URL;

export const client = hc<AppType>(BASE_URL);
