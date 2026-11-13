# Claude Code Entrypoint (`irori`)

All workspace guardrails, Human-in-the-Loop (HITL) stop gates, verification commands, and context selection rules are defined canonically in [`GEMINI.md`](GEMINI.md) and `.ai/`.

## Quick Start Protocol

1. Read [`GEMINI.md`](GEMINI.md), [`.ai/invariants.md`](.ai/invariants.md), and [`.ai/workflows/hitl-gates.md`](.ai/workflows/hitl-gates.md) before reading or editing code.
2. Follow [`.ai/workflows/context-selection.md`](.ai/workflows/context-selection.md) to load only task-relevant specs in `.docs/` and `.ai/`.
3. Apply [`.agents/skills/project-guardrails/SKILL.md`](.agents/skills/project-guardrails/SKILL.md) whenever planning, refactoring, creating migrations, updating CI, or resolving regressions.
4. Before reporting completion, run and verify all checks:
   - `typecheck` (`wrangler types --include-runtime=false && react-router typegen && tsc --noEmit`)
   - `check:ci` (`biome check .`)
   - `check:knowledge` (`tsx scripts/ai-knowledge/check-knowledge-refs.ts`)
   - `check:doc-sync` (`tsx scripts/ai-knowledge/check-doc-sync.ts`)
   - `test` (`vitest run`)
   - `build` (`react-router build`)

Never read `.env*` or `.dev.vars`, never commit/deploy without HITL confirmation, and never fabricate unverified test or build results.
