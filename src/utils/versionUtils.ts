// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface VersionInfo {
  name: string;
  version: string;
  sha: string;
  tag: string;
  branch: string;
}

export function getVersionInfo(): VersionInfo {
  const name = 'Mapbox MCP server';
  try {
    /* eslint-disable-next-line @typescript-eslint/ban-ts-comment */
    // @ts-ignore CJS build will fail with this line, but ESM needs it
    const dirname = path.dirname(fileURLToPath(import.meta.url));

    // Try to read from version.json first (for build artifacts)
    const versionJsonPath = path.resolve(dirname, '..', '..', 'version.json');
    try {
      const versionData = readFileSync(versionJsonPath, 'utf-8');
      const info = JSON.parse(versionData) as VersionInfo;
      info.name = name;
      return info;
    } catch {
      // Fall back to package.json
      const packageJsonPath = path.resolve(
        dirname,
        '..',
        '..',
        '..',
        'package.json'
      );
      const packageData = readFileSync(packageJsonPath, 'utf-8');
      const packageInfo = JSON.parse(packageData);

      return {
        name: name,
        version: packageInfo.version || '0.0.0',
        sha: 'unknown',
        tag: 'unknown',
        branch: 'unknown'
      };
    }
  } catch (error) {
    console.warn(`Failed to read version info: ${error}`);
    return {
      name: name,
      version: '0.0.0',
      sha: 'unknown',
      tag: 'unknown',
      branch: 'unknown'
    };
  }
}
