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

  it('never lets .env set a protected key, even when it is not already set (regression: endpoint redirection with no explicit host value)', () => {
    // Mirrors the exact gap flagged in PR review: a host that only sets
    // MAPBOX_ACCESS_TOKEN and leaves MAPBOX_API_ENDPOINT unset (relying on
    // the built-in default) would otherwise still let a malicious .env set
    // MAPBOX_API_ENDPOINT, since "not already set" previously meant .env
    // was free to set it.
    const dir = makeTempDirWithEnv(
      'MAPBOX_API_ENDPOINT=https://attacker.example/\n'
    );
    const env: NodeJS.ProcessEnv = {
      MAPBOX_ACCESS_TOKEN: 'host-injected-token'
      // MAPBOX_API_ENDPOINT intentionally left unset.
    };

    const result = loadDotEnv(
      dir,
      env,
      new Set(['MAPBOX_ACCESS_TOKEN', 'MAPBOX_API_ENDPOINT'])
    );

    expect(env.MAPBOX_API_ENDPOINT).toBeUndefined();
    expect(result.appliedCount).toBe(0);
    expect(result.blockedKeys).toEqual(['MAPBOX_API_ENDPOINT']);
    expect(result.skippedKeys).toEqual([]);
  });

  it('blocks a protected key even when the host already set it too', () => {
    const dir = makeTempDirWithEnv('MAPBOX_ACCESS_TOKEN=dotenv-token\n');
    const env: NodeJS.ProcessEnv = {
      MAPBOX_ACCESS_TOKEN: 'host-injected-token'
    };

    const result = loadDotEnv(dir, env, new Set(['MAPBOX_ACCESS_TOKEN']));

    expect(env.MAPBOX_ACCESS_TOKEN).toBe('host-injected-token');
    expect(result.blockedKeys).toEqual(['MAPBOX_ACCESS_TOKEN']);
    expect(result.skippedKeys).toEqual([]);
  });

  it('only blocks the named protected keys, leaving other unset keys free to apply', () => {
    const dir = makeTempDirWithEnv(
      [
        'MAPBOX_API_ENDPOINT=https://attacker.example/',
        'OTEL_SERVICE_NAME=my-service'
      ].join('\n')
    );
    const env: NodeJS.ProcessEnv = {};

    const result = loadDotEnv(dir, env, new Set(['MAPBOX_API_ENDPOINT']));

    expect(env.MAPBOX_API_ENDPOINT).toBeUndefined();
    expect(env.OTEL_SERVICE_NAME).toBe('my-service');
    expect(result.appliedCount).toBe(1);
    expect(result.blockedKeys).toEqual(['MAPBOX_API_ENDPOINT']);
  });

  it('defaults to no protected keys when the parameter is omitted (backward compatible)', () => {
    const dir = makeTempDirWithEnv(
      'MAPBOX_API_ENDPOINT=https://staging.example.com/\n'
    );
    const env: NodeJS.ProcessEnv = {};

    const result = loadDotEnv(dir, env);

    expect(env.MAPBOX_API_ENDPOINT).toBe('https://staging.example.com/');
    expect(result.blockedKeys).toEqual([]);
  });
});
