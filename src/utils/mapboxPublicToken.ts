// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { getUserNameFromToken } from './jwtUtils.js';
import type { HttpRequest } from './types.js';

interface TokenListEntry {
  token?: string;
  usage?: string;
  default?: boolean;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

const PUBLIC_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h
let cachedPublicToken: CachedToken | null = null;

/**
 * Resolve a public (pk.*) Mapbox token suitable for embedding in client-side
 * HTML (e.g. an MCP App iframe that initializes Mapbox GL JS).
 *
 * Resolution order:
 * 1. If the access token is already a pk.* token, use it directly.
 * 2. Reuse a cached pk.* token while it has >5 min TTL remaining.
 * 3. If the access token is an sk.* or tk.* token, call
 *    GET /tokens/v2/{user}?default=true to fetch the user's default public
 *    token (requires `tokens:read` scope on the bearer). OAuth-issued bearers
 *    are tk.* temporary tokens, so this is the path exercised in hosted
 *    (OAuth) deployments — without it, granting `tokens:read` has no effect.
 * 4. Fall back to the MAPBOX_PUBLIC_TOKEN env var.
 *
 * Returns undefined if none of the above produces a pk.* token.
 */
export async function resolveMapboxPublicToken(params: {
  accessToken: string;
  apiEndpoint: string;
  httpRequest: HttpRequest;
}): Promise<string | undefined> {
  const { accessToken, apiEndpoint, httpRequest } = params;

  if (accessToken.startsWith('pk.')) {
    return accessToken;
  }

  const now = Date.now();
  if (cachedPublicToken && cachedPublicToken.expiresAt - now > 5 * 60 * 1000) {
    return cachedPublicToken.token;
  }

  if (accessToken.startsWith('sk.') || accessToken.startsWith('tk.')) {
    const username = getUserNameFromToken(accessToken);
    if (username) {
      try {
        const tokensUrl = new URL(`${apiEndpoint}tokens/v2/${username}`);
        tokensUrl.searchParams.set('default', 'true');
        tokensUrl.searchParams.set('access_token', accessToken);

        const response = await httpRequest(tokensUrl.toString());
        if (response.ok) {
          const body = (await response.json()) as unknown;
          const entries: TokenListEntry[] = Array.isArray(body)
            ? (body as TokenListEntry[])
            : ((body as { tokens?: TokenListEntry[] })?.tokens ?? []);
          const defaultPk = entries.find(
            (entry) => entry?.usage === 'pk' && typeof entry.token === 'string'
          );
          if (defaultPk?.token) {
            cachedPublicToken = {
              token: defaultPk.token,
              expiresAt: now + PUBLIC_TOKEN_TTL_MS
            };
            return defaultPk.token;
          }
        } else {
          // A non-ok response (e.g. 401/403 from a missing `tokens:read` scope)
          // would otherwise fall through silently to the env-var fallback.
          console.warn(
            `resolveMapboxPublicToken: Tokens API returned HTTP ${response.status}; falling back to MAPBOX_PUBLIC_TOKEN env var`
          );
        }
      } catch (err) {
        // Network failures and JSON parse errors land here. Surface a warning
        // so the cause is diagnosable from logs rather than masked behind the
        // generic env-var fallback path.
        console.warn(
          `resolveMapboxPublicToken: Tokens API call failed, falling back to MAPBOX_PUBLIC_TOKEN env var: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  const envFallback = process.env.MAPBOX_PUBLIC_TOKEN;
  return envFallback && envFallback.startsWith('pk.') ? envFallback : undefined;
}

/**
 * Reset the cached public token. For tests only.
 */
export function __resetMapboxPublicTokenCache(): void {
  cachedPublicToken = null;
}
