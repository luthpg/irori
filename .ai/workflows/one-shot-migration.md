# One-Shot Migration Workflow (Durable Object SQLite)

`irori` persists state inside per-actor SQLite databases managed by Cloudflare Durable Objects (`SpaceActor` in `workers/actors/space.actor.ts` and `UserActor` in `workers/actors/user.actor.ts`) defined in `workers/db/space.schema.ts` and `workers/db/user.schema.ts`.

## 1. Mandatory HITL Gates

- **Gate 2**: Modifying `wrangler.jsonc` (`migrations`, `new_sqlite_classes`, Durable Object bindings) requires explicit human approval.
- **Gate 3**: Changing SQLite table DDLs in `workers/db/space.schema.ts`, `workers/db/user.schema.ts`, or `app/lib/schemas/index.ts` requires an upfront design + rollback proposal before coding.
- **Gate 1**: NEVER drop tables, delete existing R2 blobs unexpectedly, or auto-seed synthetic rows inside production actors.

## 2. Safe Durable Object Schema Evolution Pattern

Because thousands of independent `SpaceActor` and `UserActor` instances may wake up lazily months apart:

1. **Idempotent Additive DDL**:
   - Use `CREATE TABLE IF NOT EXISTS ...` and additive `ALTER TABLE ... ADD COLUMN ...` guarded by `PRAGMA table_info(<table>)` or SQLite metadata checks inside constructor/initialization (`blockConcurrencyWhile`).
2. **Backward-Compatible Reads**:
   - Provide safe defaults (`NULL` or default column values) so actors waking with older rows do not throw runtime TypeErrors before backfill.
3. **One-Shot Data Backfill (If Needed)**:
   - Make backfills idempotent and batched within `blockConcurrencyWhile` or a dedicated migration version key inside actor storage—never re-run destructive sweeps on every request.
4. **R2 + SQLite Consistency**:
   - When evolving attachment/media schemas, preserve `expires_at` / R2 cleanup invariants inside `SpaceActor.alarm()` so `IRORI_BUCKET` objects do not leak as orphans.
5. **Local Verification**:
   - Add migration/upgrade coverage in `tests/actors.test.ts` (including waking an actor with prior-version schema rows!).
   - Document the schema change in `.docs/plan.api.md` / `.ai/domain.md`.
