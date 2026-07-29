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

    // Any IPv4 address embedded in an IPv6 literal must pass the same
    // checks as a plain IPv4 literal. Rather than enumerate every named
    // encoding (IPv4-mapped, IPv4-compatible, NAT64, SIIT, ...) — which is
    // exactly the approach that missed some of them before — detect the
    // embedding structurally from the address's raw bytes:
    //  - 6to4 (2002::/16): embedded IPv4 is bytes 2-5.
    //  - Any other form where the leading 64 bits are zero and bytes 8-11
    //    are one of the three IETF-defined separators before an embedded
    //    IPv4 address in the low 32 bits — all-zero (IPv4-compatible,
    //    ::a.b.c.d), 0x0000ffff (IPv4-mapped, ::ffff:a.b.c.d), or
    //    0xffff0000 (IPv4-translated / SIIT, ::ffff:0:a.b.c.d). This also
    //    covers NAT64 (64:ff9b::/96), whose first 64 bits are non-zero but
    //    which still carries the embedded address in the low 32 bits — so
    //    it needs its own explicit check.
    const bytes = addr.toByteArray();
    const separator = bytes.slice(8, 12).join(',');
    let embeddedIPv4: number[] | null = null;
    if (range === '6to4') {
      embeddedIPv4 = bytes.slice(2, 6);
    } else if (range === 'rfc6052') {
      embeddedIPv4 = bytes.slice(12, 16);
    } else if (
      bytes.slice(0, 8).every((b) => b === 0) &&
      ['0,0,0,0', '0,0,255,255', '255,255,0,0'].includes(separator)
    ) {
      embeddedIPv4 = bytes.slice(12, 16);
    }
    if (embeddedIPv4 && isBlockedIPv4(embeddedIPv4)) {
      return false;
    }

    return true;
  }

  return true;
}
