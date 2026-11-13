# Test Refactoring Workflow

Tests exist to prove behavior under realistic conditions—not to turn red indicators green by weakening verification.

## 1. Prohibited Practices (**HITL Gate 4**)

- Deleting or skipping failing tests (`it.skip`, `describe.skip`, commenting out assertions).
- Weakening assertions (`expect(res).toBeDefined()` replacing status/payload/crypto verification).
- Mocking out the exact unit under test (for example, mocking `resolveEnterKeyAction` inside `tests/keyboard.test.ts` or mocking Web Crypto primitives inside `tests/crypto.test.ts`).
- Adding runtime auto-seeding inside `SpaceActor` or `UserActor` to satisfy test fixtures.

## 2. Safe Test Authoring & Refactoring Steps

1. **Locate Existing Coverage**:
   - `tests/actors.test.ts` — Durable Object & SQLite actor behavior
   - `tests/crypto.test.ts` — Client/Web Crypto key, envelope, and backup PIN flows
   - `tests/keyboard.test.ts` — IME and keyboard handling (`app/lib/keyboard.ts`)
2. **Preserve Pure Domain Boundaries**:
   - Test helpers should build explicit input fixtures or invoke dedicated seeding utilities cleanly without mutating production runtime startup paths.
3. **Verify Strict Equality & Biome Compliance**:
   - Test files in `tests/` are checked by Biome (`biome check .`) and strict TypeScript (`tsc --noEmit`).
4. **Run Exact Targeted & Full Suites**:
   - Targeted: `npx vitest run tests/actors.test.ts` (or `node ./node_modules/vitest/vitest.mjs run ...`)
   - Full suite after final edit: `vitest run`, `typecheck`, `check:ci`, `check:knowledge`, `check:doc-sync`, `build`.
