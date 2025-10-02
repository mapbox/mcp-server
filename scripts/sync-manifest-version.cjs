// Sync manifest.json and server.json versions with package.json
const fs = require('node:fs');
const path = require('node:path');

/**
 * Pure function that syncs versions across config objects
 * @param {Object} packageJson - The package.json object
 * @param {Object} manifestJson - The manifest.json object
 * @param {Object} serverJson - The server.json object
 * @returns {Object} Result containing updated configs and change information
 */
function syncVersionsCore(packageJson, manifestJson, serverJson) {
  const packageVersion = packageJson.version;
  const result = {
    packageVersion,
    updatedManifest: null,
    updatedServer: null,
    changes: {
      manifest: false,
      server: false,
      serverPackage: false
    },
    oldVersions: {
      manifest: manifestJson.version,
      server: serverJson.version,
      serverPackage: serverJson.packages?.[0]?.version
    }
  };

  // Check and update manifest.json
  if (manifestJson.version !== packageVersion) {
    result.updatedManifest = { ...manifestJson, version: packageVersion };
    result.changes.manifest = true;
  }

  // Check and update server.json
  const serverNeedsUpdate = serverJson.version !== packageVersion;
  const packageNeedsUpdate = serverJson.packages?.[0] &&
                            serverJson.packages[0].version !== packageVersion;

  if (serverNeedsUpdate || packageNeedsUpdate) {
    result.updatedServer = JSON.parse(JSON.stringify(serverJson)); // Deep clone

    if (serverNeedsUpdate) {
      result.updatedServer.version = packageVersion;
      result.changes.server = true;
    }

    if (packageNeedsUpdate) {
      result.updatedServer.packages[0].version = packageVersion;
      result.changes.serverPackage = true;
    }
  }

  return result;
}

function syncVersions() {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const manifestJsonPath = path.join(process.cwd(), 'manifest.json');
  const serverJsonPath = path.join(process.cwd(), 'server.json');

  // Read files
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const manifestJson = JSON.parse(fs.readFileSync(manifestJsonPath, 'utf-8'));
  const serverJson = JSON.parse(fs.readFileSync(serverJsonPath, 'utf-8'));

  // Sync versions using pure function
  const result = syncVersionsCore(packageJson, manifestJson, serverJson);

  let updatedFiles = [];

  // Write updated manifest if needed
  if (result.updatedManifest) {
    fs.writeFileSync(
      manifestJsonPath,
      JSON.stringify(result.updatedManifest, null, 2) + '\n',
      'utf-8'
    );
    console.log(
      `✓ Updated manifest.json version: ${result.oldVersions.manifest} → ${result.packageVersion}`
    );
    updatedFiles.push('manifest.json');
  }

  // Write updated server if needed
  if (result.updatedServer) {
    fs.writeFileSync(
      serverJsonPath,
      JSON.stringify(result.updatedServer, null, 2) + '\n',
      'utf-8'
    );
    console.log(
      `✓ Updated server.json versions: ${result.oldVersions.server} → ${result.packageVersion}`
    );
    updatedFiles.push('server.json');
  }

  if (updatedFiles.length === 0) {
    console.log(`✓ All versions already in sync: ${result.packageVersion}`);
  } else {
    console.log(`✓ Synced ${updatedFiles.join(', ')} with package.json version: ${result.packageVersion}`);
  }
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { syncVersionsCore, syncVersions };
}

// Run if called directly
if (require.main === module) {
  syncVersions();
}