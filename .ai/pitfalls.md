# Pitfalls Index (`irori`)

Concrete bugs, runtime hazards, and governance mistakes captured during development. Consult the category guide matching your task before editing code or CI workflows.

## Category Guides

1. **[`pitfalls/review-and-guardrails.md`](./pitfalls/review-and-guardrails.md)** — AI code review misses: nullish vs strict equality, over-engineered fallbacks, unverified paths/symbols, scope creep.
2. **[`pitfalls/environment-shell.md`](./pitfalls/environment-shell.md)** — Windows 11 / PowerShell quirks, offline sandbox `pnpm` version checks, `wrangler types` log `EPERM` noise, `.dev.vars` handling.
3. **[`pitfalls/workflow-ci.md`](./pitfalls/workflow-ci.md)** — `reviewdog/action-actionlint` permission errors (`checks: write` vs `reporter: local`), `fetch-depth: 0` for `check:doc-sync`, `pnpm/action-setup` `version:` pitfalls.
4. **[`pitfalls/backend-and-data.md`](./pitfalls/backend-and-data.md)** — Durable Object SQLite migrations, `setWorkerEnv(env)` omissions, runtime auto-seeding traps, constant-time PIN checks, R2 orphan media.
5. **[`pitfalls/testing-and-ci.md`](./pitfalls/testing-and-ci.md)** — React Router `$param` route filenames in regex validators, Biome `noAssignInExpressions`, `git status` untracked folder folding.
6. **[`pitfalls/ui-and-frontend.md`](./pitfalls/ui-and-frontend.md)** — Japanese IME `Enter` sends (`keyCode === 229`), `useSpaceWebSocket` reconnect churn, grouped message bubble regressions, italics CSS leaks.
