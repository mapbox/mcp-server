// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import ipaddr from 'ipaddr.js';

/**
 * Validates that a URL is safe for server-side fetching by an upstream service
 * (in particular, the Mapbox Static Images API which fetches custom marker
 * images server-side).
 *
 * Rejects:
 *  - non-http(s) schemes (e.g. file:, gopher:, data:, javascript:)
 *  - non-https URLs (markers should always be fetched over TLS)
 *  - URLs whose host is an IP literal in a loopback, private, link-local,
 *    unique-local, or otherwise non-routable range (CWE-918 SSRF), including
 *    IPv4 addresses embedded in an IPv6 literal via any of the standard
 *    encodings (IPv4-mapped, IPv4-compatible, 6to4, NAT64)
 *  - URLs whose host is a well-known local hostname
 *
 * Note: we do not perform DNS resolution here — the upstream service will
 * still resolve the hostname when fetching. This validation is a defense in
 * depth against the most common SSRF vectors that prompt-injected agents
 * tend to produce (IP literals and "localhost").
 */

function isBlockedIPv4(octets: number[]): boolean {
  const [a, b] = octets;
  // 0.0.0.0/8 — "this network" (unspecified + reserved); block conservatively
  if (a === 0 || a === 10 || a === 127) return true;
  // 169.254/16 (link-local, includes cloud metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 172.16/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168/16
  if (a === 192 && b === 168) return true;
  // 100.64/10 (CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 224/4 multicast and 240/4 reserved
  if (a >= 224) return true;
  return false;
}

export function isSafeExternalUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') {
    return false;
  }

  // Strip optional surrounding brackets from IPv6 literals
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();

  if (host.length === 0) {
    return false;
  }

  // Block well-known local hostnames
  const blockedHostnames = new Set([
    'localhost',
    'ip6-localhost',
    'ip6-loopback',
    'broadcasthost'
  ]);
  if (blockedHostnames.has(host) || host.endsWith('.localhost')) {
    return false;
  }

  // IPv4 literal check (dotted quad)
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1, 5).map((o) => Number(o));
    if (octets.some((o) => o < 0 || o > 255)) {
      return false;
    }
    return !isBlockedIPv4(octets);
  }

  // IPv6 literal check (presence of ':' indicates IPv6 since IPv4 was handled)
  if (host.includes(':')) {
    let addr;
    try {
      addr = ipaddr.parse(host);
    } catch {
      return false;
    }
    if (addr.kind() !== 'ipv6') {
      return false;
    }
    const range = addr.range();
    if (
      range === 'loopback' ||
      range === 'unspecified' ||
      range === 'linkLocal' ||
      range === 'uniqueLocal' ||
      range === 'multicast'
    ) {
      return false;
    }

    // Any IPv4 address embedded in an IPv6 literal — via IPv4-mapped
    // (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d), 6to4 (2002::/16), or
    // NAT64 (64:ff9b::/96, 64:ff9b:1::/48) — must pass the same checks as a
    // plain IPv4 literal, since Node's URL parser normalises the dotted-quad
    // form away and none of these encodings are otherwise distinguishable
    // by pattern-matching the string form of the address.
    const bytes = addr.toByteArray();
    let embeddedIPv4: number[] | null = null;
    if (range === 'ipv4Mapped' || range === 'rfc6052') {
      embeddedIPv4 = bytes.slice(12, 16);
    } else if (range === '6to4') {
      embeddedIPv4 = bytes.slice(2, 6);
    } else if (bytes.slice(0, 12).every((b) => b === 0)) {
      // Deprecated IPv4-compatible form: ::a.b.c.d
      embeddedIPv4 = bytes.slice(12, 16);
    }
    if (embeddedIPv4 && isBlockedIPv4(embeddedIPv4)) {
      return false;
    }

    return true;
  }

  return true;
}
