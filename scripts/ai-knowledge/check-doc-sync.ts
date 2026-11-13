import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

interface DocSyncRule {
  id: string;
  description: string;
  severity?: 'error' | 'warn';
  codePatterns: string[];
  docPatterns: string[];
}

interface KnowledgeConfig {
  docSyncRules?: DocSyncRule[];
}

interface CliOptions {
  baseRef: string | null;
  staged: boolean;
  ci: boolean;
  allowMissingBase: boolean;
}

const DEFAULT_RULES: DocSyncRule[] = [
  {
    id: 'workers-and-schemas',
    description:
      'Durable Objects, SQLite schemas, RPC, bindings, and Cloudflare Worker entrypoints',
    severity: 'error',
    codePatterns: ['wrangler.jsonc', 'workers/**', 'app/lib/schemas/**'],
    docPatterns: [
      '.docs/plan.api.md',
      '.docs/openapi.yaml',
      '.docs/requirements.md',
      '.ai/architecture.md',
      '.ai/domain.md',
      '.ai/invariants.md',
      '.ai/decisions.md',
    ],
  },
  {
    id: 'tooling-testing-and-ci',
    description: 'Tests, build/lint config, scripts, and CI/PR governance',
    severity: 'error',
    codePatterns: [
      'package.json',
      'biome.json',
      'tsconfig.json',
      '.github/**',
      'scripts/**',
      'tests/**',
    ],
    docPatterns: [
      'GEMINI.md',
      'CLAUDE.md',
      '.ai/testing.md',
      '.ai/architecture.md',
      '.ai/invariants.md',
      '.ai/workflows/*.md',
      '.ai/pitfalls/*.md',
    ],
  },
];

function findRepoRoot(startDir: string): string {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, 'package.json'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(startDir);
    }
    current = parent;
  }
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    baseRef: null,
    staged: false,
    ci: false,
    allowMissingBase: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--base') {
      const next = argv[i + 1];
      if (next == null || next.startsWith('--')) {
        throw new Error('--base requires a git ref argument.');
      }
      options.baseRef = next;
      i += 1;
    } else if (arg === '--staged') {
      options.staged = true;
    } else if (arg === '--ci') {
      options.ci = true;
    } else if (arg === '--allow-missing-base') {
      options.allowMissingBase = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function loadRules(repoRoot: string): DocSyncRule[] {
  const configPath = path.join(repoRoot, '.ai', 'config.json');
  if (!fs.existsSync(configPath)) {
    return DEFAULT_RULES;
  }
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw) as KnowledgeConfig;
  return parsed.docSyncRules ?? DEFAULT_RULES;
}

function runGit(repoRoot: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function hasGitRef(repoRoot: string, ref: string): boolean {
  try {
    runGit(repoRoot, ['rev-parse', '--verify', ref]);
    return true;
  } catch {
    return false;
  }
}

function unquoteGitPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return trimmed;
}

function getChangedFiles(repoRoot: string, options: CliOptions): string[] {
  if (options.baseRef != null) {
    if (!hasGitRef(repoRoot, options.baseRef)) {
      if (options.allowMissingBase) {
        console.log(
          `[check-doc-sync] Base ref "${options.baseRef}" not found; skipping (--allow-missing-base).`,
        );
        return [];
      }
      throw new Error(
        `Git base ref "${options.baseRef}" was not found. Ensure fetch-depth: 0 in CI.`,
      );
    }
    const output = runGit(repoRoot, [
      'diff',
      '--name-only',
      '--diff-filter=ACMRT',
      `${options.baseRef}...HEAD`,
    ]);
    return output
      .split(/\r?\n/)
      .map((line) => unquoteGitPath(line))
      .filter((line) => line.length > 0);
  }

  if (options.staged) {
    const output = runGit(repoRoot, [
      'diff',
      '--cached',
      '--name-only',
      '--diff-filter=ACMRT',
    ]);
    return output
      .split(/\r?\n/)
      .map((line) => unquoteGitPath(line))
      .filter((line) => line.length > 0);
  }

  const changed = new Set<string>();
  if (hasGitRef(repoRoot, 'HEAD')) {
    const trackedDiff = runGit(repoRoot, [
      'diff',
      '--name-only',
      '--diff-filter=ACMRT',
      'HEAD',
    ]);
    for (const line of trackedDiff.split(/\r?\n/)) {
      const normalized = unquoteGitPath(line).replace(/\\/g, '/');
      if (normalized.length > 0) {
        changed.add(normalized);
      }
    }
  }

  const statusOutput = runGit(repoRoot, [
    'status',
    '--porcelain',
    '--untracked-files=all',
  ]);
  for (const line of statusOutput.split(/\r?\n/)) {
    if (line.length < 4) {
      continue;
    }
    const rawEntry = line.slice(3).trim();
    if (rawEntry.length === 0) {
      continue;
    }
    const arrowIndex = rawEntry.indexOf(' -> ');
    const targetPath =
      arrowIndex >= 0 ? rawEntry.slice(arrowIndex + 4) : rawEntry;
    const normalized = unquoteGitPath(targetPath).replace(/\\/g, '/');
    if (normalized.length > 0) {
      changed.add(normalized);
    }
  }

  return Array.from(changed).sort((a, b) => a.localeCompare(b));
}

function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, '/');
  let regexStr = '^';
  let index = 0;

  while (index < normalized.length) {
    const char = normalized[index] ?? '';
    const nextChar = normalized[index + 1];
    const afterNext = normalized[index + 2];

    if (char === '*' && nextChar === '*') {
      if (afterNext === '/') {
        regexStr += '(?:.+/)?';
        index += 3;
      } else {
        regexStr += '.*';
        index += 2;
      }
      continue;
    }

    if (char === '*') {
      regexStr += '[^/]*';
      index += 1;
      continue;
    }

    if (char === '?') {
      regexStr += '[^/]';
      index += 1;
      continue;
    }

    regexStr += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    index += 1;
  }

  regexStr += '$';
  return new RegExp(regexStr);
}

function matchesAny(filePath: string, patterns: string[]): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return patterns.some((pattern) => globToRegExp(pattern).test(normalized));
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = findRepoRoot(process.cwd());
  const rules = loadRules(repoRoot);
  const changedFiles = getChangedFiles(repoRoot, options);

  if (changedFiles.length === 0) {
    console.log('[check-doc-sync] No changed files detected.');
    return;
  }

  const missingErrorRules: Array<{ rule: DocSyncRule; matchedCode: string[] }> =
    [];
  const missingWarnRules: Array<{ rule: DocSyncRule; matchedCode: string[] }> =
    [];

  for (const rule of rules) {
    const matchedCode = changedFiles.filter(
      (filePath) =>
        matchesAny(filePath, rule.codePatterns) &&
        !matchesAny(filePath, rule.docPatterns),
    );
    if (matchedCode.length === 0) {
      continue;
    }

    const matchedDocs = changedFiles.filter((filePath) =>
      matchesAny(filePath, rule.docPatterns),
    );
    if (matchedDocs.length === 0) {
      const severity = rule.severity ?? 'warn';
      if (severity === 'error') {
        missingErrorRules.push({ rule, matchedCode });
      } else {
        missingWarnRules.push({ rule, matchedCode });
      }
    }
  }

  for (const item of missingWarnRules) {
    console.warn(
      `[check-doc-sync] WARN (${item.rule.id}): ${item.rule.description}`,
    );
    console.warn(`  Changed code: ${item.matchedCode.join(', ')}`);
    console.warn(`  Review docs:  ${item.rule.docPatterns.join(', ')}`);
  }

  if (missingErrorRules.length > 0) {
    const label = options.ci ? 'ERROR' : 'WARN';
    for (const item of missingErrorRules) {
      console.error(
        `[check-doc-sync] ${label} (${item.rule.id}): ${item.rule.description}`,
      );
      console.error(`  Changed code: ${item.matchedCode.join(', ')}`);
      console.error(
        `  Expected doc update in one of: ${item.rule.docPatterns.join(', ')}`,
      );
    }
    if (options.ci) {
      process.exitCode = 1;
      return;
    }
  }

  if (missingErrorRules.length === 0 && missingWarnRules.length === 0) {
    console.log(
      `[check-doc-sync] OK: checked ${changedFiles.length} changed file(s) across ${rules.length} rule(s).`,
    );
  }
}

main();
