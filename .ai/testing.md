# Testing & Verification Strategy (`irori`)

## 1. Test Stack & Suite Layout

- **Runner**: Vitest (`vitest.config.ts` with `environment: 'node'` and `tsconfigPaths: true`).
- **Current Test Files (`tests/`)**:
  - `tests/actors.test.ts` — Durable Object actor logic (`SpaceActor`, `UserActor`), SQLite operations, TTL purges, and auto-close behaviors.
  - `tests/crypto.test.ts` — Client/Web Crypto E2EE primitives, key wrapping, backup PIN derivation, and envelopes.
  - `tests/keyboard.test.ts` — `resolveEnterKeyAction` (`app/lib/keyboard.ts`) IME composition, modifier keys, and mobile newline behavior.

## 2. Full Verification Pipeline

Run these checks before completing any implementation task (HITL Gate 5 requires green output from all checks):

| Check | Command (`pnpm`) | Offline Sandbox Fallback | What It Verifies |
| :--- | :--- | :--- | :--- |
| **Typegen & TS** | `pnpm run typecheck` | `npm run typecheck` | Worker bindings (`wrangler types`), React Router types, strict `tsc --noEmit` |
| **Lint & Format** | `pnpm run check:ci` | `npm run check:ci` | `biome check .` (quotes, imports, recommended lint rules) |
| **Knowledge Refs** | `pnpm run check:knowledge` | `npm run check:knowledge` | Every path reference in `GEMINI.md`, `CLAUDE.md`, `.ai/`, `.agents/` exists |
| **Doc-Sync** | `pnpm run check:doc-sync` | `npm run check:doc-sync` | Code/schema/CI diffs include mapped `.docs/` or `.ai/` updates |
| **Unit Tests** | `pnpm run test` | `npm run test` | `vitest run` across `tests/` |
| **Production Build** | `pnpm run build` | `npm run build` | Client + Cloudflare Worker SSR bundle (`react-router build`) |

## 3. Rules for Writing & Updating Tests

- Never relax assertions, skip failing tests (`it.skip` / `.only`), or replace real logic with tautological mocks just to pass CI (see [`workflows/test-refactoring.md`](./workflows/test-refactoring.md)).
- When adding WebSocket events, DO SQLite columns, rate limits, or auth checks, add corresponding targeted tests in `tests/` in the same PR.
- Only report tests or checks as passing after executing them on the **final** edited state and observing all cases pass cleanly.
