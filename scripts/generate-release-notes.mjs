/**
 * Generates Apple-style release notes from conventional commits between two refs.
 * Uses git history only (no extra dependencies).
 *
 * Env:
 * - TAG_TO: end ref (default: GITHUB_REF_NAME or latest v* tag)
 * - TAG_FROM: start ref (exclusive); default: previous v* tag vs TAG_TO, or repo root
 */

import { spawnSync } from 'node:child_process';

/**
 * @param {string[]} args
 * @param {{ optional?: boolean }} [opts]
 * @returns {string}
 */
function execGit(args, opts = {}) {
  const res = spawnSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (res.error) {
    throw res.error;
  }
  if (res.status !== 0) {
    if (opts.optional) {
      return '';
    }
    throw new Error(`git ${args.join(' ')} failed: ${(res.stderr || '').trim() || res.status}`);
  }
  return (res.stdout || '').trimEnd();
}

/** @returns {string[]} */
function listVersionTagsDescending() {
  const out = execGit(['tag', '-l', 'v*', '--sort=-v:refname'], { optional: true });
  return out
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * @param {string} current
 * @returns {string | null}
 */
function resolvePreviousVersionTag(current) {
  const tags = listVersionTagsDescending();
  const idx = tags.indexOf(current);
  if (idx >= 0 && tags[idx + 1]) {
    return tags[idx + 1];
  }
  const fallback = execGit(['describe', '--tags', '--abbrev=0', `${current}^`], {
    optional: true,
  }).trim();
  if (fallback && fallback !== current) {
    return fallback;
  }
  return null;
}

/**
 * @returns {{ from: string; to: string }}
 */
function resolveRange() {
  const to =
    (process.env.TAG_TO || process.env.GITHUB_REF_NAME || '').trim() ||
    execGit(['describe', '--tags', '--abbrev=0']).trim();

  let from = (process.env.TAG_FROM || '').trim();
  if (!from) {
    from = resolvePreviousVersionTag(to) || execGit(['rev-list', '--max-parents=0', to]).trim();
  }
  return { from, to };
}

/** @type {RegExp} */
const COMPOUND_SPLIT =
  /\s(?=(?:feat|fix|chore|docs|perf|refactor|style|test|build|ci|security)(?:\([^)]*\))?!?:\s)/iu;

/**
 * @param {string} subject
 * @returns {string[]}
 */
function splitCompoundSubject(subject) {
  const trimmed = subject.trim();
  if (!trimmed) {
    return [];
  }
  const parts = trimmed
    .split(COMPOUND_SPLIT)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : [trimmed];
}

/** @type {RegExp} */
const CONVENTIONAL = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/u;

/**
 * @param {string} subject
 * @param {string} body
 */
function parseConventional(subject, body) {
  const merged = `${subject}\n${body}`.trim();
  const breakingInBody = /BREAKING[-\s]CHANGE:\s*(.+)/i.exec(body);
  const m = CONVENTIONAL.exec(subject);
  if (!m) {
    return null;
  }
  const type = m[1].toLowerCase();
  const scope = (m[2] || '').trim();
  const bang = Boolean(m[3]);
  const description = (m[4] || '').trim();
  const breaking =
    Boolean(breakingInBody) ||
    bang ||
    /\bBREAKING\b/i.test(merged) ||
    type === 'breaking';
  return { type, scope, description, breaking, breakingText: breakingInBody?.[1]?.trim() || '' };
}

/**
 * @param {string} line
 */
function shouldSkipSubject(line) {
  const t = line.trim();
  if (!t) return true;
  if (t.startsWith('Merge ')) return true;
  if (/^v?\d+\.\d+\.\d+$/i.test(t)) return true;
  return false;
}

function collectCommits(from, to) {
  const range = `${from}..${to}`;
  const out = execGit(['log', range, '--pretty=format:%H%x1f%s%x1f%b%x1e', '--reverse'], {
    optional: true,
  });
  if (!out) {
    return [];
  }
  /** @type {{hash: string, subject: string, body: string}[]} */
  const items = [];
  for (const raw of out.split('\x1e')) {
    const chunk = raw.trim();
    if (!chunk) continue;
    const [hash, subject = '', body = ''] = chunk.split('\x1f');
    if (!hash || shouldSkipSubject(subject)) continue;
    items.push({ hash, subject: subject.trim(), body: body.trim() });
  }
  return items;
}

/**
 * @param {string} scope
 * @param {string} text
 */
function formatBullet(scope, text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  if (scope) {
    return `- **${scope}**: ${clean}`;
  }
  return `- ${clean}`;
}

/**
 * @param {Record<string, Set<string>>} buckets
 */
function buildSummary(buckets) {
  const has = (k) => buckets[k] && buckets[k].size > 0;
  if (has('breaking')) {
    return 'Includes breaking changes — review the notes below before upgrading.';
  }
  if (has('features') && (has('fixes') || has('security'))) {
    return 'New capabilities, reliability improvements, and refinements in this release.';
  }
  if (has('features')) {
    return 'New capabilities and refinements in this release.';
  }
  if (has('fixes') || has('security')) {
    return 'Bug fixes, hardening, and stability improvements in this release.';
  }
  if (has('documentation')) {
    return 'Documentation and guidance updates in this release.';
  }
  return 'General improvements and maintenance in this release.';
}

/**
 * @param {Set<string>} lines
 */
function renderSection(title, lines) {
  if (!lines.size) return '';
  const body = [...lines].join('\n');
  return `### ${title}\n\n${body}\n\n`;
}

function main() {
  const { from, to } = resolveRange();
  const commits = collectCommits(from, to);
  const versionLabel = to.startsWith('v') ? to : `v${to}`;

  /** @type {Record<string, Set<string>>} */
  const buckets = {
    breaking: new Set(),
    features: new Set(),
    enhancements: new Set(),
    performance: new Set(),
    fixes: new Set(),
    security: new Set(),
    documentation: new Set(),
  };

  for (const { subject, body } of commits) {
    const lines = splitCompoundSubject(subject);
    for (const line of lines) {
      if (shouldSkipSubject(line)) continue;
      const parsed = parseConventional(line, body);
      if (!parsed) continue;

      const { type, scope, description, breakingText, breaking } = parsed;
      const securityHit =
        type === 'security' || /\bsecurity\b/i.test(`${line}\n${body}`);

      if (breaking) {
        const bullet = formatBullet(scope, breakingText || description);
        if (bullet) buckets.breaking.add(bullet);
        continue;
      }
      if (securityHit) {
        const bullet = formatBullet(scope, description);
        if (bullet) buckets.security.add(bullet);
        continue;
      }

      const bullet = formatBullet(scope, description);
      if (!bullet) continue;

      switch (type) {
        case 'feat':
          buckets.features.add(bullet);
          break;
        case 'fix':
          buckets.fixes.add(bullet);
          break;
        case 'perf':
          buckets.performance.add(bullet);
          break;
        case 'refactor':
          buckets.enhancements.add(bullet);
          break;
        case 'docs':
          buckets.documentation.add(bullet);
          break;
        default:
          break;
      }
    }
  }

  const totalBullets = Object.values(buckets).reduce((sum, s) => sum + s.size, 0);
  if (totalBullets === 0) {
    process.stdout.write(
      `## What's New in ${versionLabel}\n\nNo categorized conventional commits in this range (${from}..${to}).\n`,
    );
    return;
  }

  const summary = buildSummary(buckets);
  let md = `## What's New in ${versionLabel}\n\n${summary}\n\n`;

  if (buckets.breaking.size) {
    md += '> **Important:** This release contains breaking changes.\n\n';
  }

  md +=
    renderSection('Breaking Changes', buckets.breaking) +
    renderSection('New Features', buckets.features) +
    renderSection('Enhancements', buckets.enhancements) +
    renderSection('Performance', buckets.performance) +
    renderSection('Bug Fixes', buckets.fixes) +
    renderSection('Security', buckets.security) +
    renderSection('Documentation', buckets.documentation);

  md = md.replace(/\n+$/u, '');
  process.stdout.write(`${md}\n`);
}

main();
