# Pitfalls: Testing, Linting & Knowledge Scripts

### React Router `$param` Filenames Stripped by Naive `$VAR` Filters
- **Symptom**: A naive regex rejecting any `$` character in `scripts/ai-knowledge/check-knowledge-refs.ts` skips valid React Router filenames such as `app/routes/chat.$spaceId.$channelId.tsx`, `app/routes/join.$spaceId.tsx`, `app/routes/api.media.$key.ts`, `app/routes/api.spaces.$spaceId.emojis.ts`, and `app/routes/api.webhooks.$token.ts`.
- **Fix & Guardrail**: Only filter shell template expressions (`${...}`) and uppercase env vars (`/^\$[A-Z_][A-Z0-9_]*$/`), allowing React Router `$param` segments to be verified against real files.

### Biome `recommended` Lint Rejections in Tooling Scripts
- **Symptom**: `while ((match = regex.exec(line)) !== null)` triggers Biome `noAssignInExpressions`, and non-prefixed Node imports (`'fs'`, `'path'`) trigger `useNodejsImportProtocol`.
- **Fix & Guardrail**: Use `for (const match of line.matchAll(pattern))`, `node:` protocol imports (`node:fs`, `node:path`, `node:child_process`), and single quotes (`biome.json`).

### `git status --porcelain` Collapsing Untracked Directories
- **Symptom**: Without `--untracked-files=all`, `git status --porcelain` outputs `.ai/` instead of individual files inside `.ai/`, causing `scripts/ai-knowledge/check-doc-sync.ts` glob patterns (like `.ai/*.md`) to miss newly created untracked doc files.
- **Fix & Guardrail**: Always pass `['status', '--porcelain', '--untracked-files=all']` when discovering working-tree changes.
