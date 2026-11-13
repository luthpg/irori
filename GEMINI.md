# AI Guardrails & Human-in-the-Loop Guide (`irori`)

> **Read First**: Inspect [`.ai/invariants.md`](.ai/invariants.md), [`.ai/workflows/context-selection.md`](.ai/workflows/context-selection.md), and [`.ai/workflows/hitl-gates.md`](.ai/workflows/hitl-gates.md) before modifying code or infrastructure.

`irori` is a single-package privacy-first community chat application built with React Router (`react-router`), Cloudflare Workers (`workers/app.ts`), Durable Objects (`SPACE_ACTOR`, `USER_ACTOR`, `CHAT_ROOM`), R2 (`IRORI_BUCKET`), and client-side Web Crypto E2EE.

---

## 1. Core Guardrails (Non-Negotiable)

- **Secret & Credential Exclusion**: NEVER read, print, commit, or edit `.env*`, `.dev.vars`, or production secrets (`SESSION_SECRET`, `IRORI_PEPPER`, `GOOGLE_CLIENT_SECRET`).
- **Fail-Closed Auth & E2EE**: All server session validation MUST fail closed (`requireAuth` / `verifySessionFromRequest` in `app/lib/auth/session.server.ts`). E2EE keys stay non-extractable in browser IndexedDB (`app/lib/crypto/e2ee.client.ts`); servers never hold plaintext Space Keys or decrypted messages.
- **No Runtime Auto-Seeding**: Production Durable Objects (`workers/actors/space.actor.ts`, `workers/actors/user.actor.ts`) MUST NEVER auto-seed dummy data at runtime. Seeding lives strictly in `scripts/seed-test-space.ts`.
- **Single-Package Integrity**: Work within `app/`, `workers/`, `scripts/`, `tests/`, `.docs/`, and `.ai/`. Do not resurrect monorepo paths (`apps/`, `packages/`).
- **Formatting & Strict Equality**: Follow `biome.json` (`single` quotes, 2-space indentation, organized imports, `recommended` lint) and always use `===` / `!==` except intentional nullish checks (`x == null` / `x != null`).

---

## 2. Human-in-the-Loop (HITL) Stop-and-Ask Gates

Before executing any action matching the gates below, STOP implementation, explain the impact/risks/rollback plan concisely, and wait for explicit human approval. See [`.ai/workflows/hitl-gates.md`](.ai/workflows/hitl-gates.md) for full details and reporting templates.

| Gate | Trigger Scope | Required Action |
| :--- | :--- | :--- |
| **Gate 1: Destructive & Secrets** | Deleting files, `git reset --hard`, dropping DO SQLite tables, R2 purges outside `alarm()`, accessing `.env*` / `.dev.vars` | **STOP & ASK** before running or modifying |
| **Gate 2: Cloudflare Deploy & Bindings** | `wrangler deploy`, `wrangler secret`, `wrangler.jsonc` binding/`new_sqlite_classes` changes, OAuth/CORS origin edits | **STOP & ASK** before applying |
| **Gate 3: Crypto, Auth & Schema Changes** | Editing `app/lib/crypto/**`, `app/lib/auth/**`, `app/lib/schemas/index.ts`, or `workers/db/*.schema.ts` DDLs | **STOP & PROPOSE** design + migration plan |
| **Gate 4: Quality Gate & Scope Exceptions** | Weakening `biome.json` / `tsconfig.json`, skipping tests/assertions, `--no-verify`, refactoring untouched prod files | **STOP & ASK** with justification |
| **Gate 5: Pre-Merge PR Sign-Off** | Preparing commits/PRs modifying code, schemas, CI, or dependencies | Complete `.github/PULL_REQUEST_TEMPLATE.md` checklist |

---

## 3. Environment & Shell Constraints (Windows 11 / PowerShell)

- **Shell**: Windows PowerShell / pwsh (`C:\Users\...`), single commands without `&&` confusion if older PowerShell is active (use `;` or separate commands).
- **Offline Sandbox Note**: `package.json` pins `pnpm@10.32.1`. In restricted offline sandboxes where `pnpm` fails checking remote registry/store metadata, execute scripts via `npm run <script>` or direct `node ...` binaries as documented in [`.ai/pitfalls/environment-shell.md`](.ai/pitfalls/environment-shell.md).
- **Node & Package Constraints**: `tsx` is installed in `devDependencies` (`package.json`) for running `scripts/ai-knowledge/*.ts`, while `seed:test-space` uses Node `>= 26` native `--experimental-strip-types`. Do NOT install new unlisted packages without checking `package.json` and asking the user.

---

## 4. Verification & QA Commands

Run these checks before considering any task complete:

```bash
pnpm run typecheck
pnpm run check:ci
pnpm run check:knowledge
pnpm run check:doc-sync
pnpm run test
pnpm run build
```

All-in-one (standard shell / CI): `pnpm run verify`.
Offline sandbox equivalent: `npm run typecheck; npm run check:ci; npm run check:knowledge; npm run check:doc-sync; npm run test; npm run build`.

---

## 5. Context Selection Map

Read ONLY the documents relevant to your current task before planning edits:

| Task Focus | Required Docs |
| :--- | :--- |
| **Always First** | [`.ai/invariants.md`](.ai/invariants.md), [`.ai/workflows/hitl-gates.md`](.ai/workflows/hitl-gates.md) |
| **Architecture & Overview** | [`.ai/architecture.md`](.ai/architecture.md), `.docs/overview.md` |
| **Domain, E2EE & Auth** | [`.ai/domain.md`](.ai/domain.md), `.docs/requirements.md` |
| **UI, Routes & Components** | [`.ai/patterns.md`](.ai/patterns.md), `.docs/DESIGN.md`, `.docs/plan.components.md`, [`.ai/pitfalls/ui-and-frontend.md`](.ai/pitfalls/ui-and-frontend.md) |
| **Durable Objects, WS & API** | `.docs/plan.api.md`, `.docs/openapi.yaml`, [`.ai/pitfalls/backend-and-data.md`](.ai/pitfalls/backend-and-data.md), [`.ai/workflows/one-shot-migration.md`](.ai/workflows/one-shot-migration.md) |
| **Testing & CI** | [`.ai/testing.md`](.ai/testing.md), [`.ai/workflows/test-refactoring.md`](.ai/workflows/test-refactoring.md), [`.ai/pitfalls/testing-and-ci.md`](.ai/pitfalls/testing-and-ci.md) |
| **Past Decisions & Pitfalls** | [`.ai/decisions.md`](.ai/decisions.md), [`.ai/pitfalls.md`](.ai/pitfalls.md) |
| **Doc-Sync & Knowledge Updates** | [`.ai/workflows/doc-sync.md`](.ai/workflows/doc-sync.md), [`.ai/workflows/knowledge-feedback.md`](.ai/workflows/knowledge-feedback.md) |
| **Skill Reference** | [`.agents/skills/project-guardrails/SKILL.md`](.agents/skills/project-guardrails/SKILL.md) |
