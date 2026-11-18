#!/usr/bin/env node
// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Prepares CHANGELOG.md for a new release by:
 * 1. Replacing "## Unreleased" with "## {version}"
 * 2. Adding current date to the version heading
 * 3. Adding a new empty "## Unreleased" section at the top
 *
 * Usage:
 *   node scripts/prepare-changelog-release.cjs <version>
 *   npm run changelog:prepare-release <version>
 *
 * Example:
 *   node scripts/prepare-changelog-release.cjs 1.0.0
 */

const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');

function prepareChangelogRelease(version) {
  if (!version) {
    console.error('Error: Version number is required');
    console.error('Usage: node scripts/prepare-changelog-release.cjs <version>');
    process.exit(1);
  }

  // Validate version format (basic semver check)
  if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/.test(version)) {
    console.error(`Error: Invalid version format: ${version}`);
    console.error('Expected format: X.Y.Z or X.Y.Z-prerelease');
    process.exit(1);
  }

  const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');

  // Check if CHANGELOG.md exists
  if (!fs.existsSync(changelogPath)) {
    console.error('Error: CHANGELOG.md not found');
    process.exit(1);
  }

  // Read CHANGELOG.md
  const content = fs.readFileSync(changelogPath, 'utf8');

  // Check if "## Unreleased" exists
  if (!content.includes('## Unreleased')) {
    console.error('Error: No "## Unreleased" section found in CHANGELOG.md');
    console.error('Nothing to release - add changes under "## Unreleased" first');
    process.exit(1);
  }

  // Get current date in YYYY-MM-DD format
  const date = new Date().toISOString().split('T')[0];

  // Replace "## Unreleased" with "## {version} - {date}"
  // and add a new "## Unreleased" section at the top
  const updatedContent = content.replace(
    '## Unreleased',
    `## Unreleased\n\n## ${version} - ${date}`
  );

  // Write updated content back to CHANGELOG.md
  fs.writeFileSync(changelogPath, updatedContent, 'utf8');

  console.log(`✓ CHANGELOG.md updated successfully`);
  console.log(`  - Released version ${version} (${date})`);
  console.log(`  - Added new "Unreleased" section`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Review CHANGELOG.md');
  console.log('  2. Commit changes: git add CHANGELOG.md && git commit -m "Release v' + version + '"');
  console.log('  3. Create tag: git tag v' + version);
  console.log('  4. Push: git push && git push --tags');
}

// Process command line arguments
const version = process.argv[2];
prepareChangelogRelease(version);
