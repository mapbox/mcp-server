// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDotEnv } from '../../src/utils/loadDotEnv.js';

describe('loadDotEnv', () => {
  const dirs: string[] = [];

  function makeTempDirWithEnv(contents: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'load-dot-env-test-'));
    writeFileSync(join(dir, '.env'), contents, 'utf-8');
    dirs.push(dir);
    return dir;
  }

  afterEach(() => {
    while (dirs.length > 0) {
      rmSync(dirs.pop()!, { recursive: true, force: true });
    }
  });

  it('applies a variable that is not already set', () => {
    const dir = makeTempDirWithEnv(
      'MAPBOX_API_ENDPOINT=https://staging.example.com/\n'
    );
    const env: NodeJS.ProcessEnv = {};

    const result = loadDotEnv(dir, env);

    expect(env.MAPBOX_API_ENDPOINT).toBe('https://staging.example.com/');
    expect(result.appliedCount).toBe(1);
    expect(result.skippedKeys).toEqual([]);
  });

  it('never overrides a variable already set by the host process', () => {
    const dir = makeTempDirWithEnv(
      [
        'MAPBOX_ACCESS_TOKEN=dotenv-token',
        'MAPBOX_API_ENDPOINT=https://dotenv.example.com/'
      ].join('\n')
    );
    const env: NodeJS.ProcessEnv = {
      MAPBOX_ACCESS_TOKEN: 'host-injected-token',
      MAPBOX_API_ENDPOINT: 'https://api.mapbox.com/'
    };

    const result = loadDotEnv(dir, env);

    expect(env.MAPBOX_ACCESS_TOKEN).toBe('host-injected-token');
    expect(env.MAPBOX_API_ENDPOINT).toBe('https://api.mapbox.com/');
    expect(result.appliedCount).toBe(0);
    expect(result.skippedKeys.sort()).toEqual(
      ['MAPBOX_ACCESS_TOKEN', 'MAPBOX_API_ENDPOINT'].sort()
    );
  });

  it('applies unset keys while leaving already-set keys from the same file untouched', () => {
    const dir = makeTempDirWithEnv(
      [
        'MAPBOX_API_ENDPOINT=https://dotenv.example.com/',
        'OTEL_SERVICE_NAME=my-service'
      ].join('\n')
    );
    const env: NodeJS.ProcessEnv = {
      MAPBOX_API_ENDPOINT: 'https://api.mapbox.com/'
    };

    const result = loadDotEnv(dir, env);

    expect(env.MAPBOX_API_ENDPOINT).toBe('https://api.mapbox.com/');
    expect(env.OTEL_SERVICE_NAME).toBe('my-service');
    expect(result.appliedCount).toBe(1);
    expect(result.skippedKeys).toEqual(['MAPBOX_API_ENDPOINT']);
  });

  it('reports exists: false and no-ops when there is no .env file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'load-dot-env-test-'));
    dirs.push(dir);
    const env: NodeJS.ProcessEnv = { FOO: 'bar' };

    const result = loadDotEnv(dir, env);

    expect(result.exists).toBe(false);
    expect(result.appliedCount).toBe(0);
    expect(result.skippedKeys).toEqual([]);
    expect(result.error).toBeNull();
    expect(env.FOO).toBe('bar');
  });
});
