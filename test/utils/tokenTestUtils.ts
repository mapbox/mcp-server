// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Build a Mapbox-style access token whose payload carries a username (`u`)
 * claim, matching what `getUserNameFromToken` expects. Used to simulate a
 * real per-account token so tests can verify `owner`-scoped temp resources
 * (map-payload refs, large-response stashes) round-trip correctly instead of
 * silently passing with `owner: undefined` on both sides.
 */
export function tokenFor(username: string): string {
  const payload = Buffer.from(JSON.stringify({ u: username })).toString(
    'base64'
  );
  return `pk.${payload}.sig`;
}
