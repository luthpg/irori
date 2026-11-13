# Pitfalls: Code Review & Guardrails

### Unverified File Paths & Symbol Names in AI Summaries
- **Root Cause**: Borrowing generic boilerplate paths from monorepo templates or guessing unverified spec file names without checking the actual repository layout.
- **Guardrail**: Enforce `scripts/ai-knowledge/check-knowledge-refs.ts` in CI and local verification; only reference files actually verified in `app/`, `workers/`, `scripts/`, `tests/`, and `.docs/`.

### Strict Equality vs Nullish Checks
- **Root Cause**: Using `==` or `!=` on non-nullish primitive comparisons violates user coding rules and risks subtle coercion bugs.
- **Guardrail**: Always use `===` and `!==`, reserving `== null` / `!= null` strictly for intentional null-or-undefined checks.

### Silent Scope Creep on Pre-Existing Security/Crypto Code
- **Root Cause**: Refactoring legacy patterns (e.g., existing `as unknown as BufferSource` casts in `app/lib/crypto/e2ee.client.ts` or PIN hash equality in `workers/actors/user.actor.ts`) opportunistically during an unrelated task introduces subtle runtime regressions without user sign-off.
- **Guardrail**: Keep changes strictly scoped to the current task; log discovered hazards in `.ai/` and trigger **HITL Gate 3** before altering security/crypto modules.
