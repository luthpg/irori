# Pitfalls: Backend, Durable Objects & Security

### Missing `setWorkerEnv(env)` on Worker Entrypoints
- **Symptom**: Calling `workers/rpc.server.ts` helpers throws missing Worker environment errors when requests enter outside the initialized fetch flow.
- **Guardrail**: Ensure every incoming request path in `workers/app.ts` invokes `setWorkerEnv(env)` prior to dispatching to React Router or WebSocket handlers.

### Runtime Auto-Seeding in Durable Objects
- **Symptom**: Auto-creating demo spaces, channels, or messages inside `SpaceActor` or `UserActor` constructors/loaders causes deleted channels to resurrect and contaminates production namespaces.
- **Guardrail**: Keep production DOs (`workers/actors/space.actor.ts`, `workers/actors/user.actor.ts`) strictly free of auto-seed logic; seed test workspaces explicitly via `scripts/seed-test-space.ts`.

### Timing-Safe Auth & Backup Hash Comparisons
- **Hazard**: Using `===` to compare cryptographic digests/HMACs leaks byte-level timing differences. Notice `workers/actors/user.actor.ts` (`unlockBackupVault`) currently uses `===` on `pinAuthHash`; verify session/OAuth HMACs via `crypto.subtle.verify` in `app/lib/auth/session.server.ts` and propose constant-time migration under **HITL Gate 3** when touching backup vault authentication.

### Ephemeral Purge & R2 Orphan Blobs
- **Symptom**: Deleting expired rows in SQLite without deleting referenced `IRORI_BUCKET` keys leaks encrypted media objects permanently in R2.
- **Guardrail**: Keep SQLite message expiration (`expires_at <= nowIso`) and `IRORI_BUCKET` deletion coupled inside `SpaceActor.alarm()` (`workers/actors/space.actor.ts`), and schedule `deleteAll()` cleanup when `auto_close_hours` rooms reach `0` active WebSockets.
