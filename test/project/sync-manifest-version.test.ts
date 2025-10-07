import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Import the pure function from the sync script
const { syncVersionsCore } = require('../../scripts/sync-manifest-version.cjs');

describe('sync-manifest-version.cjs - syncVersionsCore', () => {
  // Load fixtures
  const fixturesDir = join(__dirname, 'fixtures');
  const packageJsonFixture = JSON.parse(
    readFileSync(join(fixturesDir, 'package.json'), 'utf-8')
  );
  const manifestJsonFixture = JSON.parse(
    readFileSync(join(fixturesDir, 'manifest.json'), 'utf-8')
  );
  const serverJsonFixture = JSON.parse(
    readFileSync(join(fixturesDir, 'server.json'), 'utf-8')
  );

  it('should update manifest.json when version differs from package.json', () => {
    const packageJson = { ...packageJsonFixture, version: '3.0.0' };
    const manifestJson = { ...manifestJsonFixture, version: '1.0.0' };
    const serverJson = {
      ...serverJsonFixture,
      version: '3.0.0',
      packages: [{ ...serverJsonFixture.packages[0], version: '3.0.0' }]
    };

    const result = syncVersionsCore(packageJson, manifestJson, serverJson);

    expect(result.updatedManifest).toBeDefined();
    expect(result.updatedManifest.version).toBe('3.0.0');
    expect(result.updatedManifest.name).toBe('test-manifest'); // Other fields preserved
    expect(result.changes.manifest).toBe(true);
    expect(result.changes.server).toBe(false);
    expect(result.changes.serverPackage).toBe(false);
    expect(result.updatedServer).toBeNull();
  });

  it('should update server.json top-level version when it differs', () => {
    const packageJson = { ...packageJsonFixture, version: '4.0.0' };
    const manifestJson = { ...manifestJsonFixture, version: '4.0.0' };
    const serverJson = {
      ...serverJsonFixture,
      version: '2.0.0',
      packages: [{ ...serverJsonFixture.packages[0], version: '4.0.0' }]
    };

    const result = syncVersionsCore(packageJson, manifestJson, serverJson);

    expect(result.updatedServer).toBeDefined();
    expect(result.updatedServer.version).toBe('4.0.0');
    expect(result.updatedServer.name).toBe('test-server'); // Other fields preserved
    expect(result.changes.server).toBe(true);
    expect(result.changes.serverPackage).toBe(false);
    expect(result.changes.manifest).toBe(false);
    expect(result.updatedManifest).toBeNull();
  });

  it('should update server.json packages[0].version when it differs', () => {
    const packageJson = { ...packageJsonFixture, version: '5.0.0' };
    const manifestJson = { ...manifestJsonFixture, version: '5.0.0' };
    const serverJson = {
      ...serverJsonFixture,
      version: '5.0.0',
      packages: [{ ...serverJsonFixture.packages[0], version: '3.0.0' }]
    };

    const result = syncVersionsCore(packageJson, manifestJson, serverJson);

    expect(result.updatedServer).toBeDefined();
    expect(result.updatedServer.packages[0].version).toBe('5.0.0');
    expect(result.updatedServer.packages[0].identifier).toBe('test-package'); // Other fields preserved
    expect(result.changes.serverPackage).toBe(true);
    expect(result.changes.server).toBe(false);
    expect(result.changes.manifest).toBe(false);
  });

  it('should update all versions when all differ', () => {
    const packageJson = { ...packageJsonFixture, version: '6.0.0' };
    const manifestJson = { ...manifestJsonFixture, version: '1.0.0' };
    const serverJson = {
      ...serverJsonFixture,
      version: '2.0.0',
      packages: [{ ...serverJsonFixture.packages[0], version: '3.0.0' }]
    };

    const result = syncVersionsCore(packageJson, manifestJson, serverJson);

    expect(result.updatedManifest).toBeDefined();
    expect(result.updatedManifest.version).toBe('6.0.0');
    expect(result.updatedServer).toBeDefined();
    expect(result.updatedServer.version).toBe('6.0.0');
    expect(result.updatedServer.packages[0].version).toBe('6.0.0');
    expect(result.changes.manifest).toBe(true);
    expect(result.changes.server).toBe(true);
    expect(result.changes.serverPackage).toBe(true);
  });

  it('should return no updates when all versions are in sync', () => {
    const packageJson = { ...packageJsonFixture, version: '7.0.0' };
    const manifestJson = { ...manifestJsonFixture, version: '7.0.0' };
    const serverJson = {
      ...serverJsonFixture,
      version: '7.0.0',
      packages: [{ ...serverJsonFixture.packages[0], version: '7.0.0' }]
    };

    const result = syncVersionsCore(packageJson, manifestJson, serverJson);

    expect(result.updatedManifest).toBeNull();
    expect(result.updatedServer).toBeNull();
    expect(result.changes.manifest).toBe(false);
    expect(result.changes.server).toBe(false);
    expect(result.changes.serverPackage).toBe(false);
    expect(result.packageVersion).toBe('7.0.0');
  });

  it('should handle server.json without packages array', () => {
    const packageJson = { ...packageJsonFixture, version: '8.0.0' };
    const manifestJson = { ...manifestJsonFixture, version: '8.0.0' };
    const serverJson = {
      name: 'test-server',
      version: '1.0.0'
      // No packages array
    };

    const result = syncVersionsCore(packageJson, manifestJson, serverJson);

    expect(result.updatedServer).toBeDefined();
    expect(result.updatedServer.version).toBe('8.0.0');
    expect(result.updatedServer.packages).toBeUndefined(); // Should not add packages
    expect(result.changes.server).toBe(true);
    expect(result.changes.serverPackage).toBe(false);
  });

  it('should handle server.json with empty packages array', () => {
    const packageJson = { ...packageJsonFixture, version: '9.0.0' };
    const manifestJson = { ...manifestJsonFixture, version: '9.0.0' };
    const serverJson = {
      ...serverJsonFixture,
      version: '9.0.0',
      packages: []
    };

    const result = syncVersionsCore(packageJson, manifestJson, serverJson);

    expect(result.updatedServer).toBeNull();
    expect(result.changes.server).toBe(false);
    expect(result.changes.serverPackage).toBe(false);
  });

  it('should track old versions for reporting', () => {
    const packageJson = { ...packageJsonFixture, version: '10.0.0' };
    const manifestJson = { ...manifestJsonFixture, version: '1.1.0' };
    const serverJson = {
      ...serverJsonFixture,
      version: '2.2.0',
      packages: [{ ...serverJsonFixture.packages[0], version: '3.3.0' }]
    };

    const result = syncVersionsCore(packageJson, manifestJson, serverJson);

    expect(result.oldVersions.manifest).toBe('1.1.0');
    expect(result.oldVersions.server).toBe('2.2.0');
    expect(result.oldVersions.serverPackage).toBe('3.3.0');
    expect(result.packageVersion).toBe('10.0.0');
  });

  it('should preserve all non-version fields in updated objects', () => {
    const packageJson = { ...packageJsonFixture, version: '11.0.0' };
    const manifestJson = {
      ...manifestJsonFixture,
      version: '1.0.0',
      customField: 'should-be-preserved',
      nested: { data: 'also-preserved' }
    };
    const serverJson = {
      ...serverJsonFixture,
      version: '2.0.0',
      packages: [
        {
          ...serverJsonFixture.packages[0],
          version: '3.0.0',
          extraData: 'keep-this'
        }
      ],
      metadata: 'preserve-me'
    };

    const result = syncVersionsCore(packageJson, manifestJson, serverJson);

    expect(result.updatedManifest.customField).toBe('should-be-preserved');
    expect(result.updatedManifest.nested).toEqual({ data: 'also-preserved' });
    expect(result.updatedServer.metadata).toBe('preserve-me');
    expect(result.updatedServer.packages[0].extraData).toBe('keep-this');
  });
});
