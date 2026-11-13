---
name: project-guardrails
description: Enforce irori architectural invariants, Human-in-the-Loop (HITL) stop gates, Doc-Sync governance, Cloudflare Durable Object SQLite/E2EE safety, and full verification workflows. Always use when planning changes, touching Worker/DO/auth/crypto/UI modules, editing CI workflows, or fixing regressions.
---

# `irori` Project Guardrails & HITL Protocol

## 1. Mandatory Pre-Task Context Loading

Before editing code or workflows, load the minimal relevant files following [`.ai/workflows/context-selection.md`](../../../.ai/workflows/context-selection.md):
1. `GEMINI.md` — Global guardrails, HITL gate table, QA commands.
2. [`.ai/invariants.md`](../../../.ai/invariants.md) — Security, E2EE, DO SQLite, rate-limit, IME, and style invariants.
3. [`.ai/workflows/hitl-gates.md`](../../../.ai/workflows/hitl-gates.md) — Exact stop conditions and escalation template.

## 2. Human-in-the-Loop (HITL) Gates

STOP and wait for explicit user approval whenever a task involves:
- **Gate 1 (Destructive & Secrets)**: Reading/modifying `.env*` or `.dev.vars`, deleting files, `git reset --hard`, dropping DO SQLite tables, or deleting `IRORI_BUCKET` R2 media outside `SpaceActor.alarm()`.
- **Gate 2 (Cloudflare Deploy & Bindings)**: `wrangler deploy`, `wrangler secret`, `wrangler.jsonc` (`new_sqlite_classes`, bindings), or OAuth/CORS origin policies.
- **Gate 3 (Crypto, Auth & Schema)**: Changes to `app/lib/crypto/*.client.ts`, `app/lib/auth/*.server.ts`, `app/lib/schemas/index.ts`, or `workers/db/*.schema.ts` DDLs (or refactoring pre-existing crypto/auth checks outside scope).
- **Gate 4 (Quality & Scope Exceptions)**: Weakening `biome.json` or `tsconfig.json`, skipping tests/assertions, `--no-verify`, adding `any` / `@ts-ignore`, or mutating unrelated production code.
- **Gate 5 (Pre-PR Sign-Off)**: Completing `.github/PULL_REQUEST_TEMPLATE.md` only with directly observed verification outputs.

## 3. Critical `irori` Non-Negotiables

- **Fail-Closed Auth**: Keep `requireAuth` and `verifySessionFromRequest` (`app/lib/auth/session.server.ts`) fail-closed. Never add fallback sessions.
- **Zero Server Plaintext**: Browser identity keys remain `extractable: false` in IndexedDB (`app/lib/crypto/e2ee.client.ts`). Servers store only encrypted payloads and wrapped envelopes.
- **No Runtime Auto-Seeding**: Keep `SpaceActor` and `UserActor` (`workers/actors/space.actor.ts`, `workers/actors/user.actor.ts`) strictly data-driven; use `scripts/seed-test-space.ts` for dev/test seeding.
- **Strict Equality & Biome**: Format with `biome.json` (`single` quotes, organized imports). Always use `===` / `!==` except intentional nullish checks (`x == null` / `x != null`).
- **IME & Bubble Invariants**: Route textarea `Enter` via `resolveEnterKeyAction` (`app/lib/keyboard.ts`) and keep `app/components/chat/message-bubble.tsx` on `1 message = 1 bubble` without italics (`app/app.css`).

## 4. Verification Before Reporting Done

Run and verify all checks after the final edit:

```bash
pnpm run typecheck
pnpm run check:ci
pnpm run check:knowledge
pnpm run check:doc-sync
pnpm run test
pnpm run build
```

(In offline Windows sandboxes where `pnpm` fails checking network packageManager metadata, execute each script via `npm run <script>` or direct `node ...` binaries per [`.ai/pitfalls/environment-shell.md`](../../../.ai/pitfalls/environment-shell.md).)
