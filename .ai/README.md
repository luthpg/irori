# `.ai/` — AI Knowledge Base & HITL Governance

This directory is the canonical repository-specific operating manual for AI coding agents working on `irori`. Product specifications remain in `.docs/`; this directory bridges `.docs/` with live implementation invariants, engineering patterns, pitfalls, verification scripts, and Human-in-the-Loop (HITL) workflows.

## Directory Structure

- `../GEMINI.md` / `../CLAUDE.md` — Top-level agent instructions, HITL gate matrix, and QA commands.
- [`.ai/config.json`](./config.json) — Machine-readable repository metadata and doc-sync mapping rules consumed by `scripts/ai-knowledge/`.
- [`invariants.md`](./invariants.md) — Hard technical, security, E2EE, DO SQLite, and style invariants.
- [`architecture.md`](./architecture.md) — Single-package React Router + Cloudflare Workers + Durable Objects + R2 topology.
- [`domain.md`](./domain.md) — Domain entities, cryptographic key hierarchy, auth sessions, ephemeral rooms, and terminology.
- [`patterns.md`](./patterns.md) — Approved implementation patterns (loaders/actions, WebSocket refs, BudouX, Biome).
- [`decisions.md`](./decisions.md) — Architecture Decision Records (ADRs) and intentional tradeoffs.
- [`testing.md`](./testing.md) — Vitest setup, test boundaries, and mechanical verification scripts.
- [`pitfalls.md`](./pitfalls.md) — Index of concrete bugs and environment hazards encountered in `irori`.

## Workflows & HITL

- [`workflows/context-selection.md`](./workflows/context-selection.md) — Minimal document loading matrix by task type.
- [`workflows/hitl-gates.md`](./workflows/hitl-gates.md) — Mandatory stop-and-ask gates, escalation format, and PR sign-off protocol.
- [`workflows/doc-sync.md`](./workflows/doc-sync.md) — Keeping `.docs/` and `.ai/` synchronized with code changes.
- [`workflows/knowledge-feedback.md`](./workflows/knowledge-feedback.md) — Capturing new bugs, fixes, and decisions back into `.ai/`.
- [`workflows/one-shot-migration.md`](./workflows/one-shot-migration.md) — Safe SQLite schema evolution inside Durable Objects.
- [`workflows/test-refactoring.md`](./workflows/test-refactoring.md) — Updating tests safely without weakening assertions.
- [`workflows/git-workflow.md`](./workflows/git-workflow.md) — Branching, clean commits, and HITL PR expectations.

## Maintenance Rules

1. Run `check:knowledge` after any edit to `GEMINI.md`, `CLAUDE.md`, `.ai/**`, or `.agents/**`.
2. Keep repo file paths in `.ai/` verified against actual workspace files; write HTTP URL routes (like `` `/welcome` `` or `` `/api/users/me` ``) in backticks, never as markdown links.
3. Keep product truth in `.docs/` (`overview.md`, `requirements.md`, `DESIGN.md`, `plan.api.md`, `plan.components.md`, `openapi.yaml`) and operational guardrails in `.ai/`.
