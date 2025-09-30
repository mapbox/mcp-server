// Sync manifest.json version with package.json
const fs = require('node:fs');
const path = require('node:path');

function syncManifestVersion() {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const manifestJsonPath = path.join(process.cwd(), 'manifest.json');

  // Read package.json
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const packageVersion = packageJson.version;

  // Read manifest.json
  const manifestJson = JSON.parse(fs.readFileSync(manifestJsonPath, 'utf-8'));
  const manifestVersion = manifestJson.version;

  // Check if versions are already in sync
  if (manifestVersion === packageVersion) {
    console.log(`✓ Versions already in sync: ${packageVersion}`);
    return;
  }

  // Update manifest.json version
  manifestJson.version = packageVersion;
  fs.writeFileSync(
    manifestJsonPath,
    JSON.stringify(manifestJson, null, 2) + '\n',
    'utf-8'
  );

  console.log(
    `✓ Updated manifest.json version: ${manifestVersion} → ${packageVersion}`
  );
}

syncManifestVersion();