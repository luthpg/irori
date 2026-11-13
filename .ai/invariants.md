# Repository Invariants (`irori`)

These invariants MUST remain true across every change. Violating any item requires an immediate stop and HITL approval (see [`workflows/hitl-gates.md`](./workflows/hitl-gates.md)).

## 1. Secrets, Auth & Session Fail-Closed Rules

1. **Zero Secret Exposure**: NEVER read, inspect, log, or edit `.env*` or `.dev.vars`. Workers secrets (`SESSION_SECRET`, `IRORI_PEPPER`, `GOOGLE_CLIENT_SECRET`) enter solely through Cloudflare Worker `Env` bindings.
2. **Fail-Closed Auth**: `requireAuth` and `verifySessionFromRequest` in `app/lib/auth/session.server.ts` MUST fail closed (`401` / redirect to `` `/welcome` ``) when `SESSION_SECRET` is missing/empty or cookie signature/TTL fails validation. Never introduce fallback mock sessions.
3. **HMAC & Constant-Time Verification**: Session signatures (`irori_session`) and PKCE OAuth state cookies (`irori_oauth_state`) must verify using Web Crypto HMAC-SHA256 `crypto.subtle.verify`. For any new or refactored hash/token comparisons (such as `unlockBackupVault` in `workers/actors/user.actor.ts`), use constant-time comparison rather than plain `===`.
4. **Proxy-Aware Origin Checks**: `isSecureRequest` and `getExternalOrigin` in `app/lib/auth/session.server.ts` must continue honoring `X-Forwarded-Proto` / `X-Forwarded-Host` consistently for Cloudflare tunnels/proxies and local dev.

## 2. Client-Side E2EE & Zero-Knowledge Storage

5. **Non-Extractable Browser Keys**: Identity/personal keypairs in `app/lib/crypto/e2ee.client.ts` are stored in IndexedDB (`irori_e2ee_keystore_v1`) with `extractable: false`, backed by `navigator.storage.persist()` best-effort durability.
6. **Zero Server Plaintext**: Space Keys, message plaintext, and raw unencrypted media MUST NOT be stored unencrypted on Durable Objects or R2 (`IRORI_BUCKET`). Media files (>5MB rejected in `app/components/chat/chat-input.tsx`) are encrypted client-side before upload to `` `/api/media/:key` ``.
7. **PBKDF2 & PEPPER Key Wrapping**: Backup vault key derivation (`app/lib/crypto/backup-pin.client.ts`) uses PBKDF2 with `310,000` iterations, `AES-KW`, and server `IRORI_PEPPER` (`ENV` secret). Never weaken iteration counts or bypass server pepper without HITL Gate 3 approval.

## 3. Durable Objects, SQLite & Ephemeral Lifecycle

8. **No Runtime Auto-Seeding**: `workers/actors/space.actor.ts` and `workers/actors/user.actor.ts` MUST NEVER automatically seed mock spaces, channels, or messages during normal runtime requests. Explicit test/dev seeding resides exclusively in `scripts/seed-test-space.ts`.
9. **RPC Env Injection**: `workers/app.ts` invokes `setWorkerEnv(env)` (`workers/rpc.server.ts`) on every request before React Router handles loaders/actions so Worker bindings are available consistently.
10. **Ephemeral TTL Purge & Auto-Close**: `SpaceActor.alarm()` in `workers/actors/space.actor.ts` is the authoritative cleanup mechanism that purges expired messages (`expires_at <= nowIso`) and removes associated R2 objects from `IRORI_BUCKET`. Rooms configured with `auto_close_hours` schedule cleanup when active WebSocket count drops to `0`.
11. **Rate Limits Enforcement**: Route/API mutations enforce actor/rate-limit checks via `workers/rate-limit.server.ts` (including `45/60s` message post, `20/60s` WebSocket connect, `15/60s` media upload, and `20/60s` webhook delivery as configured in route/worker handlers).

## 4. UI, Design & Code Quality

12. **No Italics Typography**: `app/app.css` enforces `font-style: normal` globally across headings, prose, and UI chrome (`irori` anti-noise reading rule in `.docs/DESIGN.md`).
13. **IME-Safe Keyboard Handling**: Enter-to-send MUST pass through `resolveEnterKeyAction` (`app/lib/keyboard.ts`), guarding `isComposing`, `justEndedComposition`, and legacy `keyCode === 229` / `which === 229` so Japanese IME conversion never triggers accidental sends.
14. **Biome & Strict Equality**:
    - All TS/TSX/JSON code passes `biome check .` (`biome.json`: single quotes, 2-space indent, `recommended` rules, `organizeImports: "on"`).
    - Always use strict equality (`===` and `!==`), except intentional nullish checks (`someVar == null` / `someVar != null`).
    - New code should avoid `any`, `@ts-ignore`, and unnecessary `as unknown as ...` casts (do not silently rewrite legacy casts in `app/lib/crypto/*.client.ts` without Gate 3 approval).
15. **Knowledge & Doc-Sync Integrity**: Every file path cited in `.ai/`, `.agents/`, `GEMINI.md`, or `CLAUDE.md` must exist (`check:knowledge`), and code/schema changes must keep docs in sync (`check:doc-sync`).
