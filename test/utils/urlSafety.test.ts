// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { isSafeExternalUrl } from '../../src/utils/urlSafety.js';

describe('isSafeExternalUrl', () => {
  it('accepts ordinary public https URLs', () => {
    expect(isSafeExternalUrl('https://example.com/marker.png')).toBe(true);
    expect(isSafeExternalUrl('https://images.example.org:8443/a.png')).toBe(
      true
    );
    expect(isSafeExternalUrl('https://8.8.8.8/marker.png')).toBe(true);
  });

  it('rejects non-https schemes', () => {
    expect(isSafeExternalUrl('http://example.com/x.png')).toBe(false);
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeExternalUrl('gopher://example.com/')).toBe(false);
    expect(isSafeExternalUrl('data:image/png;base64,AAAA')).toBe(false);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(isSafeExternalUrl('not a url')).toBe(false);
    expect(isSafeExternalUrl('')).toBe(false);
  });

  it('rejects loopback and local hostnames', () => {
    expect(isSafeExternalUrl('https://localhost/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://LOCALHOST/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://app.localhost/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://ip6-localhost/x.png')).toBe(false);
  });

  it('rejects local hostnames written with a trailing root-label dot', () => {
    expect(isSafeExternalUrl('https://localhost./x.png')).toBe(false);
    expect(isSafeExternalUrl('https://LOCALHOST./x.png')).toBe(false);
    expect(isSafeExternalUrl('https://app.localhost./x.png')).toBe(false);
  });

  it('rejects IPv4 loopback / private / link-local / CGNAT / multicast', () => {
    expect(isSafeExternalUrl('https://127.0.0.1/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://127.1.2.3/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://10.0.0.1/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://172.16.0.1/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://172.31.255.255/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://192.168.1.1/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://169.254.169.254/latest/meta-data/')).toBe(
      false
    );
    expect(isSafeExternalUrl('https://100.64.0.1/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://0.0.0.0/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://224.0.0.1/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://255.255.255.255/x.png')).toBe(false);
  });

  it('allows public IPv4 just outside private ranges', () => {
    expect(isSafeExternalUrl('https://172.15.0.1/x.png')).toBe(true);
    expect(isSafeExternalUrl('https://172.32.0.1/x.png')).toBe(true);
    expect(isSafeExternalUrl('https://11.0.0.1/x.png')).toBe(true);
  });

  it('rejects IPv4 ranges not covered by the previous hand-written blocklist', () => {
    // 255.255.255.255 is broadcast, not multicast/reserved as previously
    // classified — still denied under deny-by-default, but for a
    // different (correct) reason.
    expect(isSafeExternalUrl('https://255.255.255.255/x.png')).toBe(false);
    // 240.0.0.1 is IANA "reserved for future use" (240/4), never explicitly
    // named in the old octet-range checks (only caught because "a >= 224"
    // over-blocked it alongside multicast).
    expect(isSafeExternalUrl('https://240.0.0.1/x.png')).toBe(false);
    // Documentation/TEST-NET ranges (RFC 5737) were never blocked by the
    // old hand-written checks at all; deny-by-default catches them for
    // free since ipaddr.js classifies them as 'reserved'.
    expect(isSafeExternalUrl('https://192.0.2.1/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://198.51.100.1/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://203.0.113.1/x.png')).toBe(false);
  });

  it('rejects IPv4 addresses written in shorthand/non-decimal notations', () => {
    // Node's URL parser canonicalizes these to dotted-quad before this
    // function ever sees the hostname, so they're covered transitively —
    // this just confirms the end-to-end behavior explicitly.
    expect(isSafeExternalUrl('https://2130706433/x.png')).toBe(false); // 127.0.0.1 as a single decimal integer
    expect(isSafeExternalUrl('https://0x7f000001/x.png')).toBe(false); // 127.0.0.1 in hex
    expect(isSafeExternalUrl('https://127.1/x.png')).toBe(false); // short form of 127.0.0.1
    expect(isSafeExternalUrl('https://0177.0.0.1/x.png')).toBe(false); // 127 in octal
  });

  it('rejects malformed IPv4-looking hosts rather than falling through to hostname handling', () => {
    // Node's URL constructor itself rejects out-of-range octets, so these
    // never reach isSafeExternalUrl with the malformed string intact —
    // confirming there's no path where an invalid IP literal is silently
    // treated as an allowed hostname.
    expect(isSafeExternalUrl('https://999.1.1.1/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://1.2.3.999999999999/x.png')).toBe(false);
  });

  it('allows ordinary public IPv6 unicast addresses', () => {
    expect(isSafeExternalUrl('https://[2607:f8b0:4004::1]/x.png')).toBe(true);
    expect(isSafeExternalUrl('https://[2001:4860:4860::8888]/x.png')).toBe(
      true
    );
  });

  it('rejects IPv6 loopback / ULA / link-local / multicast / unspecified', () => {
    expect(isSafeExternalUrl('https://[::1]/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://[::]/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://[fc00::1]/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://[fd12:3456:789a::1]/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://[fe80::1]/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://[ff02::1]/x.png')).toBe(false);
  });

  it('rejects IPv4-mapped IPv6 literals, regardless of the embedded IPv4 address', () => {
    expect(isSafeExternalUrl('https://[::ffff:127.0.0.1]/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://[::ffff:10.0.0.1]/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://[::ffff:169.254.169.254]/x.png')).toBe(
      false
    );
    // Even a mapped address embedding a public IPv4 is rejected — marker
    // hosts have no legitimate reason to be addressed via this mechanism.
    expect(isSafeExternalUrl('https://[::ffff:8.8.8.8]/x.png')).toBe(false);
  });

  it('rejects every other IPv4-in-IPv6 transition/translation encoding', () => {
    // IPv4-compatible (deprecated): Node normalises ::169.254.169.254 to
    // ::a9fe:a9fe (no dots, no ffff) — still rejected, as any address in
    // this range is.
    expect(isSafeExternalUrl('https://[::169.254.169.254]/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://[::8.8.8.8]/x.png')).toBe(false);
    // 6to4 (RFC 3056)
    expect(isSafeExternalUrl('https://[2002:808:808::]/x.png')).toBe(false);
    // NAT64, well-known prefix (RFC 6052) and local-use prefix (RFC 8215)
    expect(isSafeExternalUrl('https://[64:ff9b::808:808]/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://[64:ff9b:1::a9fe:a9fe]/x.png')).toBe(
      false
    );
    // IPv4-translated / SIIT (RFC 6145)
    expect(isSafeExternalUrl('https://[::ffff:0:808:808]/x.png')).toBe(false);
    // Teredo (RFC 4380) — embedded IPv4 is XOR-obfuscated, but the whole
    // range is denied regardless of what it decodes to.
    expect(isSafeExternalUrl('https://[2001::ffff:ffff]/x.png')).toBe(false);
    // A non-RFC-compliant NAT64 /48 encoding that places the IPv4 address
    // at hextet boundaries instead of splitting it around the reserved
    // byte — still denied, since the whole rfc6052 prefix range is denied
    // regardless of how the remaining bits are laid out.
    expect(
      isSafeExternalUrl('https://[64:ff9b:1:a9fe:0:a9fe:808:808]/x.png')
    ).toBe(false);
  });

  it('is case-insensitive for IPv6 special-range detection', () => {
    expect(isSafeExternalUrl('https://[::FFFF:169.254.169.254]/x.png')).toBe(
      false
    );
    expect(isSafeExternalUrl('https://[FE80::1]/x.png')).toBe(false);
  });
});
