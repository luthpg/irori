# Context Selection Workflow

Load only the minimum specification and knowledge files needed for the task in order to keep reasoning sharp and avoid hallucinating monorepo or unverified patterns.

## 1. Always Load First

1. `GEMINI.md` (guardrails + QA commands)
2. [`../invariants.md`](../invariants.md)
3. [`./hitl-gates.md`](./hitl-gates.md)

## 2. Task-Specific Context Matrix

| If Your Task Touches... | Read These Docs First | Key Source Entrypoints |
| :--- | :--- | :--- |
| **Routes, Loaders, Actions** | `.docs/plan.api.md`, `.docs/openapi.yaml`, [`../architecture.md`](../architecture.md) | `app/routes.ts`, `workers/app.ts` |
| **Chat UI, CSS, Theme, IME** | `.docs/DESIGN.md`, `.docs/plan.components.md`, [`../patterns.md`](../patterns.md), [`../pitfalls/ui-and-frontend.md`](../pitfalls/ui-and-frontend.md) | `app/root.tsx`, `app/app.css`, `app/lib/keyboard.ts`, `app/routes/chat.$spaceId.$channelId.tsx` |
| **WebSockets & Real-Time** | `.docs/plan.api.md`, [`../patterns.md`](../patterns.md) | `app/hooks/useSpaceWebSocket.ts`, `app/lib/schemas/index.ts`, `workers/actors/space.actor.ts` |
| **E2EE, Keys, Backup PIN, QR** | `.docs/requirements.md`, [`../domain.md`](../domain.md) | `app/lib/crypto/e2ee.client.ts`, `app/lib/crypto/backup-pin.client.ts`, `app/lib/crypto/envelope.client.ts`, `app/lib/crypto/qr-sync.client.ts` |
| **Auth, Session, OAuth** | `.docs/requirements.md`, [`../invariants.md`](../invariants.md), [`../pitfalls/backend-and-data.md`](../pitfalls/backend-and-data.md) | `app/lib/auth/session.server.ts`, `app/lib/auth/oauth.server.ts`, `app/routes/auth.google.callback.ts` |
| **Durable Objects & SQLite** | [`./one-shot-migration.md`](./one-shot-migration.md), [`../pitfalls/backend-and-data.md`](../pitfalls/backend-and-data.md) | `workers/db/space.schema.ts`, `workers/db/user.schema.ts`, `workers/actors/space.actor.ts`, `workers/actors/user.actor.ts`, `wrangler.jsonc` |
| **Tests & QA Scripts** | [`../testing.md`](../testing.md), [`./test-refactoring.md`](./test-refactoring.md), [`../pitfalls/testing-and-ci.md`](../pitfalls/testing-and-ci.md) | `vitest.config.ts`, `tests/actors.test.ts`, `tests/crypto.test.ts`, `tests/keyboard.test.ts` |
| **GitHub Actions & Knowledge** | [`./doc-sync.md`](./doc-sync.md), [`./knowledge-feedback.md`](./knowledge-feedback.md), [`../pitfalls/workflow-ci.md`](../pitfalls/workflow-ci.md) | `.ai/config.json`, `scripts/ai-knowledge/check-knowledge-refs.ts`, `scripts/ai-knowledge/check-doc-sync.ts`, `.github/workflows/ci.yml` |

## 3. Never Inspect Without Explicit User Need

- `.env*`, `.dev.vars` (FORBIDDEN — Gate 1)
- Large generated artifacts (`build/`, `.react-router/`, `dist/`, `.wrangler/`)
- Legacy documentation boilerplate outside the active workspace specs
