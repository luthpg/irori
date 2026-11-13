import fs from 'node:fs';
import path from 'node:path';

interface KnowledgeSection {
  scanDirs?: string[];
  scanFiles?: string[];
  excludeDirs?: string[];
  rootPrefixes?: string[];
  rootFiles?: string[];
}

interface KnowledgeConfig {
  knowledge?: KnowledgeSection;
}

interface RefMatch {
  filePath: string;
  line: number;
  raw: string;
  normalized: string;
  resolved: string;
  source: 'markdown-link' | 'inline-code';
}

const DEFAULT_SCAN_DIRS = ['.ai', '.agents/skills/project-guardrails'];
const DEFAULT_SCAN_FILES = ['GEMINI.md', 'CLAUDE.md'];
const DEFAULT_EXCLUDE_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.react-router',
  '.wrangler',
  '.local',
];
const DEFAULT_ROOT_PREFIXES = [
  'app/',
  'workers/',
  'scripts/',
  'tests/',
  'public/',
  '.docs/',
  '.ai/',
  '.github/',
  '.agents/',
];
const DEFAULT_ROOT_FILES = [
  'package.json',
  'pnpm-workspace.yaml',
  'biome.json',
  'tsconfig.json',
  'wrangler.jsonc',
  'vite.config.ts',
  'vitest.config.ts',
  'react-router.config.ts',
  'worker-configuration.d.ts',
  'GEMINI.md',
  'CLAUDE.md',
  'README.md',
  '.gitignore',
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

function loadConfig(repoRoot: string): Required<KnowledgeSection> {
  const configPath = path.join(repoRoot, '.ai', 'config.json');
  let parsed: KnowledgeConfig = {};
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf8');
    parsed = JSON.parse(raw) as KnowledgeConfig;
  }
  const section = parsed.knowledge ?? {};
  return {
    scanDirs: section.scanDirs ?? DEFAULT_SCAN_DIRS,
    scanFiles: section.scanFiles ?? DEFAULT_SCAN_FILES,
    excludeDirs: section.excludeDirs ?? DEFAULT_EXCLUDE_DIRS,
    rootPrefixes: section.rootPrefixes ?? DEFAULT_ROOT_PREFIXES,
    rootFiles: section.rootFiles ?? DEFAULT_ROOT_FILES,
  };
}

function collectMarkdownFiles(
  repoRoot: string,
  config: Required<KnowledgeSection>,
): string[] {
  const collected = new Set<string>();
  const excluded = new Set(config.excludeDirs);

  const walk = (dirPath: string): void => {
    if (!fs.existsSync(dirPath)) {
      return;
    }
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (excluded.has(entry.name)) {
        continue;
      }
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        collected.add(fullPath);
      }
    }
  };

  for (const dir of config.scanDirs) {
    walk(path.join(repoRoot, dir));
  }
  for (const file of config.scanFiles) {
    const fullPath = path.join(repoRoot, file);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      collected.add(fullPath);
    }
  }

  return Array.from(collected).sort((a, b) => a.localeCompare(b));
}

function stripLocationSuffix(candidate: string): string {
  const hashIndex = candidate.indexOf('#');
  const withoutHash =
    hashIndex >= 0 ? candidate.slice(0, hashIndex) : candidate;
  const queryIndex = withoutHash.indexOf('?');
  const withoutQuery =
    queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  return withoutQuery.replace(/:\d+(?::\d+)?$/, '');
}

function normalizeCandidate(raw: string): string | null {
  let trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  if (trimmed.length === 0) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('tel:') ||
    lower.startsWith('data:') ||
    lower.startsWith('file://') ||
    lower.startsWith('ws://') ||
    lower.startsWith('wss://') ||
    trimmed.startsWith('#')
  ) {
    return null;
  }

  // Allow React Router dynamic params ($spaceId, $channelId, $key, $token)
  // while skipping placeholders, shell template expansions (${VAR}), and $ENV_VARs.
  if (
    trimmed.includes('...') ||
    trimmed.includes('${') ||
    /^\$[A-Z_][A-Z0-9_]*$/.test(trimmed) ||
    /[\s<>|*?{};]/.test(trimmed)
  ) {
    return null;
  }

  const cleaned = stripLocationSuffix(trimmed);
  if (cleaned.length === 0 || cleaned === '.' || cleaned === '..') {
    return null;
  }

  return cleaned.replace(/\\/g, '/');
}

function looksLikeRepoPath(
  candidate: string,
  config: Required<KnowledgeSection>,
): boolean {
  if (candidate.startsWith('./') || candidate.startsWith('../')) {
    return true;
  }
  if (config.rootFiles.includes(candidate)) {
    return true;
  }
  return config.rootPrefixes.some((prefix) => candidate.startsWith(prefix));
}

function resolveCandidate(
  repoRoot: string,
  sourceFilePath: string,
  normalized: string,
  source: 'markdown-link' | 'inline-code',
): string {
  if (
    source === 'markdown-link' ||
    normalized.startsWith('./') ||
    normalized.startsWith('../')
  ) {
    return path.resolve(path.dirname(sourceFilePath), normalized);
  }
  return path.resolve(repoRoot, normalized);
}

function checkFile(
  repoRoot: string,
  filePath: string,
  config: Required<KnowledgeSection>,
): { checked: number; missing: RefMatch[] } {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  let inFence = false;
  let checked = 0;
  const missing: RefMatch[] = [];

  const mdLinkPattern = /!?\[[^\]]*\]\(([^)\r\n]+)\)/g;
  const inlineCodePattern = /`([^`\r\n]+)`/g;

  for (let index = 0; index < lines.length; index += 1) {
    const lineText = lines[index] ?? '';
    if (/^\s*(?:```|~~~)/.test(lineText)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }

    const lineNumber = index + 1;

    for (const match of lineText.matchAll(mdLinkPattern)) {
      const rawTarget = (match[1] ?? '').trim();
      if (rawTarget.length === 0) {
        continue;
      }
      // Handle optional markdown link title: path "title"
      const targetWithoutTitle = rawTarget.replace(/\s+["'][^"']*["']\s*$/, '');
      const normalized = normalizeCandidate(targetWithoutTitle);
      if (normalized == null) {
        continue;
      }
      const resolved = resolveCandidate(
        repoRoot,
        filePath,
        normalized,
        'markdown-link',
      );
      checked += 1;
      if (!fs.existsSync(resolved)) {
        missing.push({
          filePath,
          line: lineNumber,
          raw: rawTarget,
          normalized,
          resolved,
          source: 'markdown-link',
        });
      }
    }

    // Remove markdown links before scanning backticks on the same line
    const lineWithoutLinks = lineText.replace(mdLinkPattern, ' ');
    for (const match of lineWithoutLinks.matchAll(inlineCodePattern)) {
      const rawCode = match[1] ?? '';
      const normalized = normalizeCandidate(rawCode);
      if (normalized == null || !looksLikeRepoPath(normalized, config)) {
        continue;
      }
      const resolved = resolveCandidate(
        repoRoot,
        filePath,
        normalized,
        'inline-code',
      );
      checked += 1;
      if (!fs.existsSync(resolved)) {
        missing.push({
          filePath,
          line: lineNumber,
          raw: rawCode,
          normalized,
          resolved,
          source: 'inline-code',
        });
      }
    }
  }

  return { checked, missing };
}

function main(): void {
  const repoRoot = findRepoRoot(process.cwd());
  const config = loadConfig(repoRoot);
  const files = collectMarkdownFiles(repoRoot, config);

  if (files.length === 0) {
    console.error('[check-knowledge-refs] No markdown knowledge files found.');
    process.exitCode = 1;
    return;
  }

  let totalRefs = 0;
  const allMissing: RefMatch[] = [];

  for (const filePath of files) {
    const result = checkFile(repoRoot, filePath, config);
    totalRefs += result.checked;
    allMissing.push(...result.missing);
  }

  if (allMissing.length > 0) {
    console.error(
      `[check-knowledge-refs] Found ${allMissing.length} broken path reference(s) across ${files.length} files:`,
    );
    for (const item of allMissing) {
      const relSource = path
        .relative(repoRoot, item.filePath)
        .replace(/\\/g, '/');
      const relResolved = path
        .relative(repoRoot, item.resolved)
        .replace(/\\/g, '/');
      console.error(
        `  - ${relSource}:${item.line} (${item.source}) "${item.raw}" -> missing "${relResolved}"`,
      );
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `[check-knowledge-refs] OK: verified ${totalRefs} reference(s) across ${files.length} knowledge file(s).`,
  );
}

main();
