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
 *  - URLs whose host is an IP literal outside the plain public "unicast"
 *    range (CWE-918 SSRF) — see the deny-by-default note below
 *  - URLs whose host is a well-known local hostname, under a reserved
 *    local/internal-use suffix (.internal, .local, .arpa), or dotless
 *    (single-label hostnames never resolve to a public host)
 *
 * Note: we do not perform DNS resolution here — the upstream service will
 * still resolve the hostname when fetching. This validation is a defense in
 * depth against the most common SSRF vectors that prompt-injected agents
 * tend to produce (IP literals and "localhost"). It cannot, by design,
 * defend against DNS rebinding (an ordinary hostname resolving to an
 * internal address at fetch time) — that has to be handled where the fetch
 * actually happens. Two related gaps are out of scope for the same reason:
 * we don't restrict the port (the upstream fetcher is where that belongs),
 * and the local/internal-use suffix list can't be exhaustive (network-
 * specific suffixes like .corp, .lan, or .home resolve only on particular
 * private networks and aren't enumerable in general) — both are the same
 * class of problem as DNS rebinding, not gaps worth growing this list for.
 *
 * Both IPv4 and IPv6 literals are allowed only when ipaddr.js classifies
 * them as plain global "unicast" addresses; every other named range —
 * loopback, private, link-local, unique-local, multicast, broadcast,
 * carrier-grade NAT, reserved, and every IPv4-in-IPv6 transition/
 * translation mechanism (IPv4-mapped, IPv4-compatible, 6to4, NAT64, SIIT,
 * Teredo, AMT, ORCHID, etc.) — is rejected outright. This is a
 * deliberate deny-by-default choice: legitimate marker image hosts have no
 * reason to be addressed through any of these mechanisms, and enumerating
 * which specific ranges or encodings are "dangerous enough to block" (the
 * previous approach) has repeatedly missed cases as new ones were found.
 * Denying everything except the one category that's actually normal is
 * simpler and strictly safer.
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
    return false;
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
    return host.includes('.');
  }
  const addr = ipaddr.parse(host);

  // Deny by default for both IPv4 and IPv6: only plain global unicast
  // addresses are allowed. Every other named range (private, loopback,
  // link-local, multicast, broadcast, CGNAT, reserved, unique-local, and
  // every IPv4-in-IPv6 transition/translation mechanism) is rejected,
  // regardless of what it does or doesn't embed.
  if (addr.range() !== 'unicast') {
    return false;
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
      return false;
    }
  }

  return true;
}
