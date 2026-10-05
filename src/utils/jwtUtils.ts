// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Extract the Mapbox username from a JWT access token.
 *
 * Mapbox tokens are JWTs whose payload contains the username under the `u` key.
 * Returns undefined if the token is malformed or missing the `u` field — callers
 * can decide whether to surface an error or fall back to another auth path.
 *
 * SECURITY: the returned name is an UNVERIFIED claim. This decodes the payload
 * without checking the signature (Mapbox signs with a secret only Mapbox holds,
 * so it cannot be checked here), which means any caller can fabricate a token
 * asserting any username. Use this only where the value is non-authoritative —
 * e.g. building a `/tokens/v2/{username}` request URL, where a forged name
 * simply makes the Mapbox API reject the call. Never use it to decide whether
 * one caller may read another caller's data; use {@link getOwnerKeyFromToken}
 * and {@link ownerKeyMatches} for that.
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

/**
 * Derive the ownership key used to scope temporary resources to the caller.
 *
 * This is a SHA-256 fingerprint of the raw token string — NOT the `u` claim.
 * The distinction is the whole point: `getUserNameFromToken` reads an
 * *unverified* claim out of a token payload that anyone can fabricate, because
 * Mapbox signs its tokens with a secret only Mapbox holds and this server
 * therefore cannot check the signature locally. Scoping a resource by username
 * means anyone who learns a resource URI and a Mapbox username can mint a
 * garbage token asserting `{"u":"<victim>"}` and read that resource.
 *
 * Fingerprinting the token instead makes the check depend on bytes the attacker
 * would have to already possess. An attacker holding the victim's real token
 * does not need this path at all — they can call the Mapbox API directly — so
 * the bypass stops being worth anything. No signature verification and no
 * network round-trip to an introspection endpoint are required, which keeps
 * resource reads at the O(1) cost the temporary-resource cache exists to
 * preserve.
 *
 * Tradeoff: ownership is now per-token rather than per-account. A caller that
 * rotates to a different token mid-session can no longer read resources it
 * created under the previous one; those reads fail closed and surface as the
 * normal "not found or expired" response. With a 30-minute TTL this is a narrow
 * window, and failing closed is the correct direction for an authorization
 * check.
 *
 * Returns undefined for an empty/absent token so callers keep failing closed.
 */
export function getOwnerKeyFromToken(
  token: string | undefined
): string | undefined {
  if (!token) return undefined;
  return createHash('sha256').update(token, 'utf-8').digest('hex');
}

/**
 * Compare two ownership keys from {@link getOwnerKeyFromToken}.
 *
 * Fails closed when either side is undefined — an unowned resource is never
 * readable. The comparison is constant-time so the check cannot be probed
 * byte-by-byte; SHA-256 preimage resistance already makes a leaked digest
 * useless, but an authorization comparison on a credential-derived value has no
 * reason not to be constant-time.
 */
export function ownerKeyMatches(
  expected: string | undefined,
  actual: string | undefined
): boolean {
  if (!expected || !actual) return false;
  const a = Buffer.from(expected, 'utf-8');
  const b = Buffer.from(actual, 'utf-8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
