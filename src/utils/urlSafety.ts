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
 *  - IPv4/IPv6 literals outside ipaddr.js's plain "unicast" range —
 *    deny-by-default, so loopback, private, link-local, multicast,
 *    broadcast, CGNAT, reserved, and every IPv4-in-IPv6 transition/
 *    translation mechanism (mapped, compatible, 6to4, NAT64, SIIT, Teredo,
 *    AMT, ORCHID, etc.) are all rejected without needing to be named
 *    individually (CWE-918 SSRF)
 *  - well-known local hostnames, reserved local/internal-use suffixes
 *    (.internal, .local, .arpa), and dotless single-label hostnames
 *
 * Out of scope, by design, for this pre-fetch string check — all three
 * require validating the actual connection, not the URL string, so they
 * belong where the fetch happens, not here:
 *  - DNS rebinding (an ordinary hostname resolving to an internal address
 *    at fetch time)
 *  - port restriction
 *  - network-specific hostname suffixes (.corp, .lan, .home, etc.) —
 *    unlike .internal/.local/.arpa, these aren't globally reserved, so
 *    they can't be enumerated in general
 */

export function isSafeExternalUrl(rawUrl: string): boolean {
  return parseSafeExternalUrl(rawUrl) !== null;
}

/**
 * Same validation as isSafeExternalUrl, but returns the parsed URL on
 * success (null otherwise) so callers that need the WHATWG-canonical form
 * of the validated URL don't have to re-parse the raw string.
 */
export function parseSafeExternalUrl(rawUrl: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') {
    return null;
  }

  // Strip optional surrounding brackets from IPv6 literals and a trailing
  // root-label dot (e.g. "localhost." is equivalent to "localhost"). The
  // dotless-hostname check further below relies on this running first —
  // without it, "intranet." would still contain a dot and slip past that
  // check.
  const host = parsed.hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();

  if (host.length === 0) {
    return null;
  }

  // Block well-known local hostnames
  const blockedHostnames = new Set([
    'localhost',
    'ip6-localhost',
    'ip6-loopback',
    'broadcasthost'
  ]);
  // Suffixes reserved for local/internal use that no public marker image
  // host is ever legitimately under: cloud-internal DNS zones (.internal,
  // used by GCP/AWS service discovery — covers metadata.google.internal,
  // the GCP metadata endpoint's actual hostname), mDNS (.local), and
  // reverse-DNS / home-network zones reserved by RFC 6761/8375 (.arpa
  // covers .in-addr.arpa, .ip6.arpa, and .home.arpa as suffixes of it).
  const blockedSuffixes = ['.localhost', '.internal', '.local', '.arpa'];
  if (
    blockedHostnames.has(host) ||
    blockedSuffixes.some((suffix) => host.endsWith(suffix))
  ) {
    return null;
  }

  // If the host isn't a parseable IP literal at all, it's an ordinary
  // hostname — allowed here (subject to the checks above), except that a
  // public marker image host always has at least one dot; a dotless,
  // single-label hostname only resolves via the fetcher's own network
  // search-domain suffixing (e.g. "intranet", "metadata"), which is never
  // the case for a legitimate external image URL. DNS rebinding on a
  // multi-label hostname is out of scope for this pre-fetch check, see the
  // module doc comment.
  if (!ipaddr.isValid(host)) {
    return host.includes('.') ? parsed : null;
  }
  const addr = ipaddr.parse(host);

  // Deny by default for both IPv4 and IPv6: only plain global unicast
  // addresses are allowed. Every other named range (private, loopback,
  // link-local, multicast, broadcast, CGNAT, reserved, unique-local, and
  // every IPv4-in-IPv6 transition/translation mechanism) is rejected,
  // regardless of what it does or doesn't embed.
  if (addr.range() !== 'unicast') {
    return null;
  }

  if (addr.kind() === 'ipv6') {
    // ipaddr.js does not classify the deprecated IPv4-compatible form
    // (::a.b.c.d, i.e. the leading 96 bits all zero) as a special range
    // when written in plain hex, which is exactly the form Node's URL
    // parser normalises a dotted-quad IPv4-compatible literal to — so it
    // reaches here as ordinary 'unicast' and needs an explicit check.
    // (::1 and :: are already excluded above via the loopback/unspecified
    // ranges, so this only affects addresses with a genuine embedded IPv4.)
    const bytes = addr.toByteArray();
    if (bytes.slice(0, 12).every((b) => b === 0)) {
      return null;
    }
  }

  return parsed;
}
