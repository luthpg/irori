# Pitfalls: GitHub Actions & CI Workflows

### `reviewdog/action-actionlint` Fails Under Minimal `contents: read` Permissions
- **Symptom**: `reviewdog/action-actionlint` defaults to `reporter: github-pr-check`, which requires `checks: write` permissions and fails on hardened workflows scoped to `permissions: contents: read` (or fork PRs).
- **Fix & Guardrail**: Explicitly pass `reporter: local` (or `github-pr-review` with scoped permissions) so workflow linting succeeds under `contents: read`.

### `check-doc-sync.ts --base` Fails on Shallow GitHub Checkouts
- **Symptom**: `actions/checkout` defaults to `fetch-depth: 1`, causing `git diff origin/main...HEAD` inside `scripts/ai-knowledge/check-doc-sync.ts` to fail with `unknown revision`.
- **Fix & Guardrail**: Configure `fetch-depth: 0` and `persist-credentials: false` on `actions/checkout@v5` in `.github/workflows/ci.yml`.

### Hardcoding `pnpm` Version in `pnpm/action-setup`
- **Symptom**: Specifying `with: version: ...` alongside `"packageManager": "pnpm@10.32.1"` in `package.json` causes conflicts or setup errors in `pnpm/action-setup@v4`.
- **Fix & Guardrail**: Omit `version:` in `pnpm/action-setup@v4` so CI installs the exact version pinned in `package.json`.
