# Pitfalls: Environment & Windows / PowerShell

### Offline Windows Sandbox + `pnpm` `packageManager` Check
- **Symptom**: Running `pnpm ...` inside an offline Windows sandbox hangs or fails with permission/registry errors (`os error 5` / supply-chain verification failure) because `package.json` pins `"packageManager": "pnpm@10.32.1"` against a mismatched global `pnpm` binary (`v12.14.0`).
- **Fix & Guardrail**: Keep `"packageManager": "pnpm@10.32.1"` for CI and local host shells, while running scripts via `npm run <script>` or direct `node ...` (e.g., `node ./node_modules/@biomejs/biome/bin/biome check .`) when inside offline sandboxes.

### `wrangler types` Sandbox Log `EPERM` Warning
- **Symptom**: `wrangler types --include-runtime=false` (invoked by `npm run typecheck`) prints a non-fatal `EPERM` warning attempting to write debug logs under `AppData\Roaming\xdg.config\.wrangler\logs`, while still succeeding and regenerating `worker-configuration.d.ts`.
- **Guardrail**: Do not treat that log-file warning as a typecheck failure; always check `git diff worker-configuration.d.ts` afterwards to confirm no unexpected diff remains.

### Mixed TypeScript Script Runners (`tsx` vs `node --experimental-strip-types`)
- **Context**: `check:knowledge` and `check:doc-sync` execute via `tsx` (`devDependencies` in `package.json`), whereas `seed:test-space` runs via `node --experimental-strip-types`.
- **Guardrail**: Use `pnpm run <script>` / `npm run <script>` (or `pnpm exec tsx ...` / `npx tsx ...` in tool calls) so local `node_modules/.bin/tsx` resolves cleanly without requiring global `tsx`, and preserve `seed:test-space` type-stripping compatibility unless migrating it intentionally.

### Reading `.dev.vars` or `.env*`
- **Hazard**: Local Cloudflare secret files (`.dev.vars`, `.env*`) live in the workspace for `@cloudflare/vite-plugin` dev runs.
- **Guardrail**: NEVER open, inspect, print, or stage `.dev.vars` or `.env*` (**HITL Gate 1**).
