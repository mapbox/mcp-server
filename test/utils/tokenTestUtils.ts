// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { getOwnerKeyFromToken } from '../../src/utils/jwtUtils.js';

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

/**
 * The ownership key a temp resource created with `tokenFor(username)` is
 * stamped with. Ownership is keyed on a fingerprint of the token bytes, not on
 * the (unsigned, forgeable) username claim, so tests that seed a resource
 * directly must seed this rather than a bare username.
 */
export function ownerKeyFor(username: string): string {
  return getOwnerKeyFromToken(tokenFor(username)) as string;
}
