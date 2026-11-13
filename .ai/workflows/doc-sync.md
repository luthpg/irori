# Doc-Sync Workflow

Documentation stays authoritative when `.docs/` and `.ai/` evolve in the same PR as structural code changes. This workflow is mechanically enforced by `scripts/ai-knowledge/check-doc-sync.ts` and `.ai/config.json`.

## 1. Sync Rules Matrix (`.ai/config.json`)

| Rule ID | Triggering Code Changes | Expected Docs Updated | CI Severity |
| :--- | :--- | :--- | :--- |
| `workers-and-schemas` | `wrangler.jsonc`, `workers/**`, `app/lib/schemas/**` | `.docs/plan.api.md`, `.docs/openapi.yaml`, `.docs/requirements.md`, `.ai/architecture.md`, `.ai/domain.md`, `.ai/invariants.md`, `.ai/decisions.md` | `error` |
| `auth-and-crypto` | `app/lib/auth/**`, `app/lib/crypto/**`, `app/routes/auth.*.ts`, `app/routes/restore-key.tsx`, `workers/rate-limit.server.ts` | `.docs/requirements.md`, `.docs/plan.api.md`, `.ai/invariants.md`, `.ai/domain.md`, `.ai/pitfalls/backend-and-data.md`, `.ai/decisions.md` | `error` |
| `routes-and-api` | `app/routes.ts`, `app/routes/api.*.ts`, `app/hooks/useSpaceWebSocket.ts` | `.docs/plan.api.md`, `.docs/openapi.yaml`, `.ai/architecture.md`, `.ai/patterns.md`, `.ai/pitfalls/ui-and-frontend.md` | `error` |
| `ui-and-design-system` | `app/root.tsx`, `app/app.css`, `app/components/**`, `app/hooks/**`, `app/lib/keyboard.ts`, `app/routes/*.tsx` | `.docs/DESIGN.md`, `.docs/plan.components.md`, `.ai/patterns.md`, `.ai/pitfalls/ui-and-frontend.md` | `warn` |
| `tooling-testing-and-ci` | `package.json`, `biome.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `react-router.config.ts`, `.github/**`, `scripts/**`, `tests/**` | `GEMINI.md`, `CLAUDE.md`, `.ai/testing.md`, `.ai/architecture.md`, `.ai/invariants.md`, `.ai/workflows/*.md`, `.ai/pitfalls/*.md` | `error` |

## 2. How to Run Locally & in CI

- Working tree (dev feedback): `pnpm run check:doc-sync` (or `npm run check:doc-sync`)
- Staged changes: `pnpm exec tsx scripts/ai-knowledge/check-doc-sync.ts --staged`
- PR comparison against base branch (CI): `pnpm exec tsx scripts/ai-knowledge/check-doc-sync.ts --base origin/main --ci`

## 3. When a Change Needs No Doc Update (HITL Exception)

If an `error`-severity file change truly does not alter any architecture, API, invariant, or workflow (for example, a pure internal bugfix in `workers/rate-limit.server.ts`), NEVER disable `check:doc-sync` globally (**Gate 4**). Either record a concise clarification note in `.ai/decisions.md` / `.ai/pitfalls/` if non-obvious, or ask the human reviewer before overriding CI.
