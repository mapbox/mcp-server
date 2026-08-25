// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

export interface LoadDotEnvResult {
  path: string;
  exists: boolean;
  appliedCount: number;
  skippedKeys: string[];
  error: Error | null;
}

/**
 * Loads a `.env` file from `cwd` into `env`, without overriding any key
 * already present. A variable set by the MCP host (Claude Desktop, VS Code,
 * a hosted deployment's process environment, etc.) must always win over a
 * project-local `.env` — otherwise a `.env` file dropped into or committed
 * to a cloned repo could silently redirect security-relevant variables
 * (e.g. MAPBOX_API_ENDPOINT) out from under an operator who already
 * configured them correctly at the host level, while the host-injected
 * MAPBOX_ACCESS_TOKEN still gets sent to wherever that endpoint now points.
 */
export function loadDotEnv(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env
): LoadDotEnvResult {
  const path = join(cwd, '.env');
  const exists = existsSync(path);
  let appliedCount = 0;
  const skippedKeys: string[] = [];
  let error: Error | null = null;

  if (exists) {
    try {
      const parsed = parseEnv(readFileSync(path, 'utf-8'));
      for (const [key, value] of Object.entries(parsed)) {
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

  return { path, exists, appliedCount, skippedKeys, error };
}
