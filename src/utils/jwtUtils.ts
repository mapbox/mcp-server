// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Extract the Mapbox username from a JWT access token.
 *
 * Mapbox tokens are JWTs whose payload contains the username under the `u` key.
 * Returns undefined if the token is malformed or missing the `u` field — callers
 * can decide whether to surface an error or fall back to another auth path.
 */
export function getUserNameFromToken(token: string): string | undefined {
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64').toString('utf-8')
    ) as { u?: unknown };
    return typeof payload.u === 'string' ? payload.u : undefined;
  } catch {
    return undefined;
  }
}
