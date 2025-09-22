import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Version Consistency', () => {
  it('should have matching versions in package.json and server.json', () => {
    const packageJsonPath = join(__dirname, '..', '..', 'package.json');
    const serverJsonPath = join(__dirname, '..', '..', 'server.json');

    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const serverJson = JSON.parse(readFileSync(serverJsonPath, 'utf-8'));

    const packageVersion = packageJson.version;
    const serverVersion = serverJson.version;
    const serverPackageVersion = serverJson.packages?.[0]?.version;

    expect(serverVersion).toBe(packageVersion);
    expect(serverPackageVersion).toBe(packageVersion);
  });
});
