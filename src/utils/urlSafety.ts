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
 *
 * IPv6 addresses are allowed only when they fall in the plain global
 * "unicast" range as classified by ipaddr.js. Every IPv6 special-purpose
 * range — loopback, link-local, unique-local, multicast, reserved, and the
 * various IPv4-in-IPv6 transition/translation mechanisms (IPv4-mapped,
 * IPv4-compatible, 6to4, NAT64, SIIT, Teredo, AMT, ORCHID, etc.) — is
 * rejected outright, rather than trying to decode and check the IPv4
 * address some of these mechanisms embed. Legitimate marker image hosts
 * have no reason to be addressed through a transition mechanism, and
 * decoding each one correctly (some split the embedded address around
 * reserved bits, some XOR-obfuscate it) is error-prone and has repeatedly
 * missed cases; denying the whole category is simpler and strictly safer.
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

  // Strip optional surrounding brackets from IPv6 literals and a trailing
  // root-label dot (e.g. "localhost." is equivalent to "localhost")
  const host = parsed.hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();

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
    // Deny by default: only plain global unicast addresses are allowed.
    // Every special-purpose range (loopback, link-local, unique-local,
    // multicast, reserved, and every IPv4-in-IPv6 transition/translation
    // mechanism) is rejected, regardless of what it does or doesn't embed.
    if (addr.range() !== 'unicast') {
      return false;
    }
    // ipaddr.js does not classify the deprecated IPv4-compatible form
    // (::a.b.c.d, i.e. the leading 96 bits all zero) as a special range
    // when written in plain hex, which is exactly the form Node's URL
    // parser normalises a dotted-quad IPv4-compatible literal to — so it
    // reaches here as ordinary 'unicast' and needs an explicit check.
    // (::1 and :: are already excluded above via the loopback/unspecified
    // ranges, so this only affects addresses with a genuine embedded IPv4.)
    const bytes = addr.toByteArray();
    if (bytes.slice(0, 12).every((b) => b === 0)) {
      return false;
    }
    return true;
  }

  return true;
}
