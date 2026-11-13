## Summary

- What changed and why:
- Linked issue / spec section (`.docs/`):

## Change Classification (HITL Gates)

Check all gates triggered by this PR and ensure human approval is documented below:

- [ ] **Gate 1 (Destructive / Secrets)**: Deletes files/tables/R2 objects, resets git history, or touches secret handling (verified zero `.env*` / `.dev.vars` commits)
- [ ] **Gate 2 (Cloudflare Deploy / Bindings)**: Modifies `wrangler.jsonc` (`durable_objects`, `r2_buckets`, `migrations` / `new_sqlite_classes`), OAuth callback URLs, or CORS/origin headers
- [ ] **Gate 3 (Auth / E2EE Crypto / Schema)**: Modifies `app/lib/crypto/**`, `app/lib/auth/**`, `app/lib/schemas/index.ts`, or `workers/db/*.schema.ts` DDLs
- [ ] **Gate 4 (Quality / Scope Exception)**: Relaxes lint/type rules, skips assertions, or adds CI/doc-sync exceptions (explicit reviewer justification attached)
- [ ] **None of Gates 1-4 triggered**

## Migration & Rollback Plan (Required if Gate 1-3 Checked)

- Durable Object SQLite backward compatibility (`blockConcurrencyWhile` / additive `ALTER TABLE`):
- R2 (`IRORI_BUCKET`) orphan/cleanup impact (`SpaceActor.alarm()`):
- Rollback steps:

## Verification Results (Paste Observed Local Outputs Only)

- [ ] `pnpm run check:ci` (`biome check .`)
- [ ] `pnpm run check:knowledge` (`check-knowledge-refs.ts`)
- [ ] `pnpm run check:doc-sync` (`check-doc-sync.ts`)
- [ ] `pnpm run typecheck` (`wrangler types && react-router typegen && tsc --noEmit`)
- [ ] `pnpm run test` (`vitest run`)
- [ ] `pnpm run build` (`react-router build`)

## Documentation & Knowledge Sync

- Updated `.docs/` files (if API/schema/UI changed):
- Updated `.ai/` files (invariants, decisions, pitfalls, workflows if applicable):
