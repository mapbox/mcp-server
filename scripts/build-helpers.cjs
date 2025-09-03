// Cross-platform build helper script
const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');
const { execSync } = require('child_process');

// Create directory recursively (cross-platform equivalent of mkdir -p)
function mkdirp(dirPath) {
  const absolutePath = path.resolve(dirPath);
  if (!fs.existsSync(absolutePath)) {
    fs.mkdirSync(absolutePath, { recursive: true });
  }
}

// Generate version info
function generateVersion() {
  mkdirp('dist');
  
  const sha = execSync('git rev-parse HEAD').toString().trim();
  const tag = execSync('git describe --tags --always').toString().trim();
  const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  const version = process.env.npm_package_version;
  
  const versionInfo = {
    sha,
    tag,
    branch,
    version
  };
  
  fs.writeFileSync('dist/esm/version.json', JSON.stringify(versionInfo, null, 2));
  fs.writeFileSync('dist/commonjs/version.json', JSON.stringify(versionInfo, null, 2));
  
  console.log('Generated version.json:', versionInfo);
}

// Process command line arguments
const command = process.argv[2];

switch (command) {
  case 'generate-version':
    generateVersion();
    break;
  default:
    console.error('Unknown command:', command);
    process.exit(1);
}
