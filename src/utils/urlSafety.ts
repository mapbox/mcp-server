// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Validates that a URL is safe for server-side fetching by an upstream service
 * (in particular, the Mapbox Static Images API which fetches custom marker
 * images server-side).
 *
 * Rejects:
 *  - non-http(s) schemes (e.g. file:, gopher:, data:, javascript:)
 *  - non-https URLs (markers should always be fetched over TLS)
 *  - URLs whose host is an IP literal in a loopback, private, link-local,
 *    unique-local, or otherwise non-routable range (CWE-918 SSRF)
 *  - URLs whose host is a well-known local hostname
 *
 * Note: we do not perform DNS resolution here — the upstream service will
 * still resolve the hostname when fetching. This validation is a defense in
 * depth against the most common SSRF vectors that prompt-injected agents
 * tend to produce (IP literals and "localhost").
 */
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
    const [a, b] = octets;
    // 0.0.0.0/8, 10/8, 127/8
    // 0.0.0.0/8 — "this network" (unspecified + reserved); block conservatively
    if (a === 0 || a === 10 || a === 127) return false;
    // 169.254/16 (link-local, includes cloud metadata 169.254.169.254)
    if (a === 169 && b === 254) return false;
    // 172.16/12
    if (a === 172 && b >= 16 && b <= 31) return false;
    // 192.168/16
    if (a === 192 && b === 168) return false;
    // 100.64/10 (CGNAT)
    if (a === 100 && b >= 64 && b <= 127) return false;
    // 224/4 multicast and 240/4 reserved
    if (a >= 224) return false;
    return true;
  }

  // IPv6 literal check (presence of ':' indicates IPv6 since IPv4 was handled)
  if (host.includes(':')) {
    // ::1 loopback, :: unspecified
    if (host === '::1' || host === '::') return false;
    // fc00::/7 unique local (fc.. or fd..)
    if (/^f[cd][0-9a-f]{2}:/.test(host)) return false;
    // fe80::/10 link-local
    if (/^fe[89ab][0-9a-f]:/.test(host)) return false;
    // ff00::/8 multicast
    if (/^ff[0-9a-f]{2}:/.test(host)) return false;
    // IPv4-mapped / IPv4-compatible IPv6: ::ffff:a.b.c.d or ::a.b.c.d
    // (Node's URL parser normalises ::ffff:127.0.0.1 to ::ffff:7f00:1, so
    // detect the embedded IPv4 either as a dotted-quad or as the
    // ::ffff:xxxx:xxxx hex form.)
    if (/\d+\.\d+\.\d+\.\d+/.test(host)) return false;
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(host)) return false;
    return true;
  }

  return true;
}
