import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'cloudflare:workers': resolve(
        __dirname,
        './tests/cloudflare-workers-mock.ts'
      ),
    },
  },
});
