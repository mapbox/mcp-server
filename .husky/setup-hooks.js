import { writeFileSync, mkdirSync, chmodSync, constants } from 'node:fs';
import { execSync } from 'node:child_process';
import { platform } from 'node:os';

mkdirSync('.husky', { recursive: true });

execSync('git config core.hooksPath .husky');

writeFileSync(
  '.husky/pre-commit',
  `#!/usr/bin/env sh
npm run sync-manifest
git add manifest.json
npx lint-staged`
);

// Cross-platform way to make the file executable
if (platform() === 'win32') {
  // On Windows, executable permissions don't matter as much
  console.log('pre-commit script created.');
} else {
  // On Unix systems, use chmod
  try {
    execSync('chmod +x .husky/pre-commit');
    console.log('pre-commit script created.');
  } catch {
    // Fallback to Node.js fs.chmodSync if available
    try {
      chmodSync(
        '.husky/pre-commit',
        constants.S_IRWXU | constants.S_IRGRP | constants.S_IXGRP
      ); // 0o750
      console.log('pre-commit script created.');
    } catch {
      console.warn(
        'Warning: Could not set executable permissions on the hook file'
      );
    }
  }
}
