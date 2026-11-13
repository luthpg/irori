# Architecture Overview (`irori`)

`irori` is a single-package full-stack TypeScript application running React Router v7/Framework Mode (`react-router@^8.5.1`) on Cloudflare Workers with SQLite-backed Durable Objects and R2 object storage.

## 1. Repository Layout

- `app/` — React Router application (SSR loaders/actions + `clientLoader.hydrate` browser decryption)
  - `app/routes.ts` — Route table (17 route definitions across UI pages, Google OAuth, and `/api/*` endpoints)
  - `app/root.tsx`, `app/app.css` — Root HTML shell, `ErrorBoundary` (details shown only when `import.meta.env.DEV`), global dark-canvas theme & focus rings
  - `app/lib/schemas/index.ts` — Shared TypeScript domain models, WebSocket events (`ClientToServerWsEvent`, `ServerToClientWsEvent`), and DTOs
  - `app/lib/auth/` — `session.server.ts`, `oauth.server.ts` (server-only session & Google PKCE OAuth)
  - `app/lib/crypto/` — `e2ee.client.ts`, `backup-pin.client.ts`, `envelope.client.ts`, `qr-sync.client.ts` (browser Web Crypto API)
  - `app/lib/keyboard.ts` — IME-safe keyboard action resolver
  - `app/hooks/` — `useSpaceWebSocket.ts`, `useBudouX.ts`, `useAmbientSound.ts`
  - `app/components/chat/` — `chat-input.tsx`, `message-bubble.tsx`, `chat-timeline.tsx`, and chat panes
- `workers/` — Cloudflare Worker runtime & Durable Objects
  - `workers/app.ts` — Worker `fetch` entrypoint (`setWorkerEnv(env)` -> WebSocket upgrade passthrough -> React Router handler) and Durable Object exports
  - `workers/rpc.server.ts` — Accessor helpers for Durable Object stubs and Worker `Env`
  - `workers/rate-limit.server.ts` — Sliding-window/counter rate limiting for HTTP and WebSocket operations
  - `workers/db/` — `space.schema.ts` (9 SQLite tables) and `user.schema.ts` (5 SQLite tables)
  - `workers/actors/` — `space.actor.ts` (`SpaceActor`), `user.actor.ts` (`UserActor`)
- `scripts/` — CLI utilities (`scripts/seed-test-space.ts`, `scripts/ai-knowledge/check-knowledge-refs.ts`, `scripts/ai-knowledge/check-doc-sync.ts`)
- `tests/` — Vitest unit/actor test suite (`tests/actors.test.ts`, `tests/crypto.test.ts`, `tests/keyboard.test.ts`)
- `.docs/` — Canonical product design, API plan, component plan, and OpenAPI specification

## 2. Cloudflare Bindings (`wrangler.jsonc`)

| Binding | Type | Class / Target | Purpose |
| :--- | :--- | :--- | :--- |
| `SPACE_ACTOR` | Durable Object (SQLite) | `SpaceActor` (`workers/actors/space.actor.ts`) | Space metadata, channels, members, encrypted messages, reactions, bookmarks, webhooks, Space Key envelopes, WS fanout, TTL alarms |
| `USER_ACTOR` | Durable Object (SQLite) | `UserActor` (`workers/actors/user.actor.ts`) | User profile, OAuth identity links, joined spaces, encrypted backup vault, personal bookmarks/device key metadata |
| `CHAT_ROOM` | Durable Object (SQLite) | `ChatRoom` (legacy/declared DO migration class) | Retained in `wrangler.jsonc` migrations alongside `SPACE_ACTOR` and `USER_ACTOR` |
| `IRORI_BUCKET` | R2 Bucket | `irori-media` | Client-encrypted binary blobs, avatars/media payloads |

> [!IMPORTANT]
> Modifying `new_sqlite_classes` or Durable Object bindings in `wrangler.jsonc` affects stateful production SQLite namespaces and triggers **HITL Gate 2**.

## 3. Request & Data Flow

1. **HTTP SSR / API Requests**:
   `workers/app.ts` calls `setWorkerEnv(env)` -> passes request to React Router server bundle -> route `loader` / `action` validates `irori_session` via `app/lib/auth/session.server.ts` -> queries `UserActor` / `SpaceActor` RPC methods via `workers/rpc.server.ts`.
2. **Browser Hydration & Decryption**:
   Routes like `app/routes/chat.$spaceId.$channelId.tsx` define `clientLoader` (`clientLoader.hydrate = true`) + `HydrateFallback`. Encrypted payloads returned by the SSR loader are unwrapped and decrypted strictly in browser memory using `app/lib/crypto/e2ee.client.ts` and `app/lib/crypto/envelope.client.ts`.
3. **Real-Time WebSocket Fanout**:
   Client WebSocket upgrades target `SpaceActor`, managed by `app/hooks/useSpaceWebSocket.ts` using Hibernatable WebSockets (`acceptWebSocket` / `webSocketMessage` / `webSocketClose` / `alarm`).
4. **Build & Type Pipeline**:
   - `wrangler types --include-runtime=false` regenerates `worker-configuration.d.ts` (excluded from Biome in `biome.json`).
   - `react-router typegen` generates `.react-router/types/` route module types.
   - `react-router build` bundles client and Worker server artifacts via `@cloudflare/vite-plugin` (`vite.config.ts`).
