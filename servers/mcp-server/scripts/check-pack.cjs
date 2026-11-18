// Check what `npm pack` would publish before a release does.
//
// Fails when an entry point (exports, bin, main, types) isn't in the
// package, or when a file the latest published version has is gone.
// Removed files are allowed with --allow-removed or PACK_ALLOW_REMOVED=true,
// for a deliberate removal such as dropping a tool.
//
// Usage: node scripts/check-pack.cjs [packageDir] [--allow-removed]
// Run it after `npm run build`.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

/**
 * Collect the files package.json points at: every exports target, bin, main,
 * types and module.
 * @param {Object} packageJson - The package.json object
 * @returns {string[]} Sorted, de-duplicated paths relative to the package root
 */
function entryPoints(packageJson) {
  const found = new Set();
  const add = (value) => {
    if (typeof value === 'string') {
      found.add(path.posix.normalize(value.replace(/^\.\//, '')));
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(add);
    }
  };
  add(packageJson.exports);
  add(packageJson.bin);
  add(packageJson.main);
  add(packageJson.types);
  add(packageJson.module);
  return [...found].filter((file) => !file.includes('*')).sort();
}

/**
 * Pure check of a pack file list against the package's entry points and the
 * latest published file list.
 * @param {Object} packageJson - The package.json object
 * @param {string[]} packedFiles - Files `npm pack` would publish now
 * @param {string[] | null} publishedFiles - Files in the latest published version, or null if there is none
 * @param {{ allowRemoved?: boolean }} [options]
 * @returns {Object} Missing entry points, added and removed files, and whether the check passed
 */
function checkPackCore(packageJson, packedFiles, publishedFiles, options = {}) {
  const packed = new Set(packedFiles);
  const missingEntryPoints = entryPoints(packageJson).filter(
    (file) => !packed.has(file)
  );

  let added = [];
  let removed = [];
  if (publishedFiles) {
    const published = new Set(publishedFiles);
    added = packedFiles.filter((file) => !published.has(file)).sort();
    removed = publishedFiles.filter((file) => !packed.has(file)).sort();
  }

  const failures = [];
  if (missingEntryPoints.length > 0) {
    failures.push(
      `${missingEntryPoints.length} entry point(s) missing from the package`
    );
  }
  if (removed.length > 0 && !options.allowRemoved) {
    failures.push(
      `${removed.length} file(s) in the latest published version are gone`
    );
  }

  return {
    missingEntryPoints,
    added,
    removed,
    failures,
    ok: failures.length === 0
  };
}

/**
 * Read the file list from `npm pack --json` output. Lifecycle scripts can
 * print to stdout first (npm 10 prints "pre-commit script created."), so
 * the JSON starts at the first line that begins with "[".
 * @param {string} output - stdout of `npm pack --dry-run --json`
 * @returns {string[]} Paths of the files in the package
 */
function parsePackOutput(output) {
  const start = output.search(/^\[/m);
  if (start === -1) {
    throw new Error(`No JSON in npm pack output:\n${output}`);
  }
  return JSON.parse(output.slice(start))[0].files.map((file) => file.path);
}

function packFiles(args, cwd) {
  const output = execFileSync(
    'npm',
    ['pack', '--dry-run', '--json', '--ignore-scripts', ...args],
    { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  return parsePackOutput(output);
}

function publishedFileList(packageJson, cwd) {
  try {
    return packFiles([`${packageJson.name}@latest`], cwd);
  } catch (error) {
    const message = String(error.stderr || error.message);
    if (/E404|is not in this registry|No match found/.test(message)) {
      return null;
    }
    throw error;
  }
}

function list(title, files) {
  if (files.length === 0) return [];
  return [
    `**${title}** (${files.length}):`,
    '',
    ...files.map((f) => `- \`${f}\``),
    ''
  ];
}

function checkPack() {
  const args = process.argv.slice(2);
  const packageDir = path.resolve(args.find((a) => !a.startsWith('--')) || '.');
  const allowRemoved =
    args.includes('--allow-removed') ||
    process.env.PACK_ALLOW_REMOVED === 'true';

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(packageDir, 'package.json'), 'utf-8')
  );
  const packedFiles = packFiles([], packageDir);
  const publishedFiles = publishedFileList(packageJson, packageDir);
  const result = checkPackCore(packageJson, packedFiles, publishedFiles, {
    allowRemoved
  });

  const baseline = publishedFiles
    ? `the latest published version (${publishedFiles.length} files)`
    : 'nothing: this package has not been published yet';
  const lines = [
    `### npm pack check: ${packageJson.name}`,
    '',
    `${result.ok ? '✓' : '✗'} ${packedFiles.length} files packed, compared with ${baseline}.`,
    '',
    ...result.failures.map((failure) => `- ✗ ${failure}`),
    ...(result.removed.length > 0 && allowRemoved
      ? [
          '- Removed files allowed (pack-files-removed label or --allow-removed)'
        ]
      : []),
    '',
    ...list('Missing entry points', result.missingEntryPoints),
    ...list('Removed since the latest published version', result.removed),
    ...list('Added since the latest published version', result.added)
  ];
  const summary = lines.join('\n');

  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  }
  if (!result.ok) {
    process.exitCode = 1;
  }
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { checkPackCore, entryPoints, parsePackOutput };
}

// Run if called directly
if (require.main === module) {
  checkPack();
}
