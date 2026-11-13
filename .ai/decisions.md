# Architecture Decision Records (`irori`)

## ADR-001: Single-Package React Router + Cloudflare Workers Topology

- **Status**: Accepted (active on `refactor/single-package-react-router`)
- **Context**: `irori` originally included monorepo workspace metadata (`pnpm-workspace.yaml` referencing `apps/*`), which created unnecessary boundary friction across shared schemas, SSR loaders, and Cloudflare Worker Durable Object stubs.
- **Decision**: Consolidate into a single-package layout rooted at `app/` (React Router Framework Mode) and `workers/` (Cloudflare Worker entrypoint + Durable Objects + SQLite schemas) configured via `vite.config.ts`, `tsconfig.json`, and `wrangler.jsonc`.
- **Consequence**: All workspace docs, scripts, and knowledge checks operate on single-package paths (`app/`, `workers/`, `scripts/`, `tests/`, `.docs/`, `.ai/`). Legacy `apps/` references in templates are explicitly excluded.

## ADR-002: Client-Side E2EE Key Ownership Over Server-Managed Keys

- **Status**: Accepted
- **Context**: Community chat spaces hold sensitive conversations and uploaded media (`IRORI_BUCKET`).
- **Decision**: Keep identity keypairs non-extractable inside IndexedDB (`irori_e2ee_keystore_v1` in `app/lib/crypto/e2ee.client.ts`), wrap Space Keys per device (`app/lib/crypto/envelope.client.ts`), and derive backup vault keys client-side with PBKDF2 (`310,000` iters) + `AES-KW` + server `IRORI_PEPPER` (`app/lib/crypto/backup-pin.client.ts`).
- **Consequence**: Servers store only ciphertext and wrapped envelopes; recovery requires either QR cross-device transfer (`app/lib/crypto/qr-sync.client.ts`) or user PIN + server pepper (`app/routes/restore-key.tsx`).

## ADR-003: Durable Object SQLite per Actor + Explicit Seeding Separation

- **Status**: Accepted
- **Context**: Combining automatic runtime seed logic inside Durable Objects risks re-creating deleted rooms or leaking mock data into production namespaces.
- **Decision**: Keep `workers/actors/space.actor.ts` and `workers/actors/user.actor.ts` strictly data-driven via `workers/db/space.schema.ts` and `workers/db/user.schema.ts`. Isolate mock data generation to `scripts/seed-test-space.ts`.
- **Consequence**: Clean, deterministic production startup and safer automated actor tests (`tests/actors.test.ts`).

## ADR-004: `tsx` Execution with Zero-Dependency Self-Contained Knowledge Scripts

- **Status**: Accepted
- **Context**: Knowledge governance scripts (`scripts/ai-knowledge/check-knowledge-refs.ts`, `scripts/ai-knowledge/check-doc-sync.ts`) should run reliably across Node versions and support standard TypeScript ergonomics if extended later.
- **Decision**: Add `tsx` to `devDependencies` (`package.json`) and execute `check:knowledge` / `check:doc-sync` via `tsx` (`pnpm exec tsx` in CI), while keeping the scripts self-contained (`node:*` builtins only) and strictly typed so both `tsc --noEmit` and Biome pass cleanly. `seed:test-space` remains on `node --experimental-strip-types`.
- **Consequence**: Contributors and CI run knowledge checks consistently with `tsx` (`^4.23.15`), and scripts remain free of runtime coupling to `app/` or `workers/`.

## ADR-005: `pnpm@10.32.1` in CI with Offline Sandbox Script Fallback

- **Status**: Accepted
- **Context**: `package.json` pins `"packageManager": "pnpm@10.32.1"`. On Windows sandboxes without network access, invoking global `pnpm` may hang or fail verifying packageManager/registry policies.
- **Decision**: Use `pnpm/action-setup@v4` in `.github/workflows/ci.yml` while permitting `npm run <script>` or direct `node ...` invocation inside offline sandboxed environments.
- **Consequence**: Identical underlying scripts run cleanly in both developer/sandbox terminals and GitHub Actions CI.
