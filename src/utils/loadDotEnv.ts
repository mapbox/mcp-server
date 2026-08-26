// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

export interface LoadDotEnvResult {
  path: string;
  exists: boolean;
  appliedCount: number;
  /** Keys skipped because the target env already had a value for them. */
  skippedKeys: string[];
  /**
   * Keys skipped because they're in `protectedKeys`, regardless of whether
   * the target env already had a value for them.
   */
  blockedKeys: string[];
  error: Error | null;
}

/**
 * Loads a `.env` file from `cwd` into `env`, without overriding any key
 * already present. A variable set by the MCP host (Claude Desktop, VS Code,
 * a hosted deployment's process environment, etc.) should always win over a
 * project-local `.env`, matching the precedence Node's own
 * `process.loadEnvFile()` already applies.
 *
 * `protectedKeys` names keys `.env` may never set at all, even when the
 * target env has no existing value for them — for security-sensitive keys
 * (an API endpoint, an access token), "not yet set" shouldn't be treated as
 * license for a project-local file to set it, since that file is far less
 * trusted than whatever launched the process. Those keys must come from a
 * real environment variable or be left at their built-in default.
 */
export function loadDotEnv(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
  protectedKeys: ReadonlySet<string> = new Set()
): LoadDotEnvResult {
  const path = join(cwd, '.env');
  const exists = existsSync(path);
  let appliedCount = 0;
  const skippedKeys: string[] = [];
  const blockedKeys: string[] = [];
  let error: Error | null = null;

  if (exists) {
    try {
      const parsed = parseEnv(readFileSync(path, 'utf-8'));
      for (const [key, value] of Object.entries(parsed)) {
        if (protectedKeys.has(key)) {
          blockedKeys.push(key);
          continue;
        }
        if (env[key] !== undefined) {
          skippedKeys.push(key);
          continue;
        }
        env[key] = value;
        appliedCount++;
      }
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e));
    }
  }

  return { path, exists, appliedCount, skippedKeys, blockedKeys, error };
}
