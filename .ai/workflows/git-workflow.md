# Git & Pull Request Workflow (`irori`)

## 1. Branch & Commit Hygiene

- Never work directly on protected production branches (`main`) for non-trivial changes; keep branch names descriptive (e.g., `feat/...`, `fix/...`, `refactor/...`).
- Never stage or commit secrets (`.env*`, `.dev.vars`) or local scratch notes (`.local/` is ignored in `.gitignore`).
- Inspect `git status` and `git diff worker-configuration.d.ts` before staging: `wrangler types --include-runtime=false` runs inside `typecheck`, so verify whether `worker-configuration.d.ts` has legitimate binding updates or no diff.
- NEVER use `git commit --no-verify`, `git reset --hard`, or `git push --force` without explicit HITL **Gate 1 / Gate 4** approval.

## 2. Pre-PR Verification Checklist

Before creating a PR or asking a human to review/merge:

1. Run `typecheck`, `check:ci`, `check:knowledge`, `check:doc-sync`, `test`, and `build` against final edits.
2. Confirm every `.docs/` and `.ai/` reference matches actual repository paths and symbols.
3. Fill out `.github/PULL_REQUEST_TEMPLATE.md` including HITL gate confirmations and rollback strategy.
