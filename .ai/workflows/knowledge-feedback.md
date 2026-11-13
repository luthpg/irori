# Knowledge Feedback Loop

Every non-obvious failure, environment quirk, review catch, or architectural tradeoff discovered during development should feed back into `.ai/` so the same mistake never recurs.

## 1. Where to Record New Findings

| Finding Type | Target File |
| :--- | :--- |
| Permanent rule or security/auth constraint | [`../invariants.md`](../invariants.md) |
| Architectural choice with alternatives considered | [`../decisions.md`](../decisions.md) |
| Reusable implementation idiom | [`../patterns.md`](../patterns.md) |
| AI review miss / scope / equality bug | [`../pitfalls/review-and-guardrails.md`](../pitfalls/review-and-guardrails.md) |
| Windows / PowerShell / sandbox / Wrangler quirk | [`../pitfalls/environment-shell.md`](../pitfalls/environment-shell.md) |
| GitHub Actions / actionlint / permissions issue | [`../pitfalls/workflow-ci.md`](../pitfalls/workflow-ci.md) |
| DO SQLite / R2 / Auth / Crypto runtime hazard | [`../pitfalls/backend-and-data.md`](../pitfalls/backend-and-data.md) |
| Vitest / Biome / Knowledge script bug | [`../pitfalls/testing-and-ci.md`](../pitfalls/testing-and-ci.md) |
| React Router hydration / WebSocket / IME / CSS bug | [`../pitfalls/ui-and-frontend.md`](../pitfalls/ui-and-frontend.md) |

## 2. Entry Template

Keep entries concrete, verifiable, and concise:

```markdown
### <Short Descriptive Title>
- **Symptom**: What failed or risked silent corruption.
- **Root Cause**: Exact file/mechanism responsible.
- **Fix & Guardrail**: How we resolved it and how to prevent recurrence.
```

## 3. Verification After Updating `.ai/`

Always run:
1. `pnpm run check:knowledge` (or `npm run check:knowledge`)
2. `pnpm run check:ci` (`biome check .` to ensure formatting compliance across workspace files)
