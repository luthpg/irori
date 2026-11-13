# Human-in-the-Loop (HITL) Gates & Escalation Protocol

`irori` operates under explicit Human-in-the-Loop (HITL) control. Autonomous speed NEVER overrides safety, cryptographic soundness, production state integrity, or scope clarity.

---

## 1. Mandatory Stop-and-Ask Gates

### Gate 1: Destructive Operations & Secret Protection (`STOP & ASK`)
Trigger before ANY of the following:
- Reading, printing, editing, or staging `.env*`, `.dev.vars`, or credential files.
- Deleting source/test/doc files, running `git reset --hard`, `git clean -fd`, or `git push --force`.
- Dropping/truncating SQLite tables in Durable Objects (`SpaceActor`, `UserActor`) or deleting R2 `IRORI_BUCKET` objects outside `SpaceActor.alarm()`.

### Gate 2: Cloudflare Production, Deploy & Binding Changes (`STOP & ASK`)
Trigger before ANY of the following:
- Executing `wrangler deploy`, `wrangler secret put`, or any live Cloudflare dashboard/CLI mutation.
- Modifying `wrangler.jsonc` (`main`, `r2_buckets`, `durable_objects`, `migrations` / `new_sqlite_classes`).
- Changing OAuth redirect URIs, cookie `SameSite`/`Secure` flags, or external CORS/proxy header handling in `app/lib/auth/session.server.ts` / `app/lib/auth/oauth.server.ts`.

### Gate 3: Security, E2EE Cryptography & Schema Design Changes (`STOP & PROPOSE`)
Trigger before editing:
- Cryptographic primitives, key wrapping, IndexedDB storage format, PBKDF2 iteration counts, or PEPPER handling (`app/lib/crypto/*.client.ts`, `workers/actors/user.actor.ts`).
- Session signing, PKCE verification, rate limit thresholds (`app/lib/auth/*.server.ts`, `workers/rate-limit.server.ts`).
- Shared contracts or SQLite tables (`app/lib/schemas/index.ts`, `workers/db/space.schema.ts`, `workers/db/user.schema.ts`).
- Refactoring pre-existing security/legacy code (e.g., `unlockBackupVault` hash comparison in `workers/actors/user.actor.ts` or legacy casts in `app/lib/crypto/*.client.ts`) outside the immediate request.

### Gate 4: Quality Gate Exceptions, Workarounds & Scope Creep (`STOP & ASK`)
Trigger before ANY of the following:
- Disabling/relaxing rules in `biome.json` or `tsconfig.json`.
- Adding `@ts-ignore`, `@ts-expect-error`, explicit `any`, or bypassing Biome lint checks.
- Skipping/deleting failing unit tests or adding `--no-verify`.
- Modifying untouched application modules outside the agreed task scope.

### Gate 5: Pre-Commit / Pre-PR Human Sign-Off (`REQUIRED CHECKLIST`)
Before proposing a commit or PR:
1. Run full verification (`typecheck`, `check:ci`, `check:knowledge`, `check:doc-sync`, `test`, `build`).
2. Confirm `git status` and `git diff worker-configuration.d.ts` contain no unintended artifacts.
3. Fill out `.github/PULL_REQUEST_TEMPLATE.md` accurately with observed command results only.

---

## 2. Standard Stop-and-Ask Report Format

Whenever a HITL Gate triggers, STOP immediately and present this exact 4-part summary to the user:

```text
[HITL GATE TRIGGERED: Gate #<number> - <title>]
1. Target Action / Change: <file paths, commands, or Cloudflare bindings affected>
2. Why It Triggered: <security / data loss / schema / deploy / scope risk>
3. Proposed Options & Rollback Plan:
   - Option A (Recommended): <safe approach + exact rollback steps>
   - Option B: <alternative>
4. Waiting for Approval: Reply with your choice to proceed.
```

---

## 3. Blocked Execution Rule

If a tool check, auth flow, or sandbox boundary fails in a way requiring human credentials or elevated access (such as Cloudflare authentication or secret injection), report the exact error and stop. Never attempt workarounds that bypass permission checks or security gates.
