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

  it('rejects IPv6 loopback / ULA / link-local / multicast', () => {
    expect(isSafeExternalUrl('https://[::1]/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://[::]/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://[fc00::1]/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://[fd12:3456:789a::1]/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://[fe80::1]/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://[ff02::1]/x.png')).toBe(false);
  });

  it('rejects IPv4-mapped IPv6 literals', () => {
    expect(isSafeExternalUrl('https://[::ffff:127.0.0.1]/x.png')).toBe(false);
  });

  it('rejects IPv4-mapped IPv6 for private IPv4 ranges', () => {
    expect(isSafeExternalUrl('https://[::ffff:10.0.0.1]/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://[::ffff:192.168.1.1]/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://[::ffff:172.16.0.1]/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://[::ffff:169.254.169.254]/x.png')).toBe(
      false
    );
  });

  it('rejects IPv4-compatible IPv6 for blocked IPv4 ranges', () => {
    // Node normalises ::169.254.169.254 to ::a9fe:a9fe (no dots, no ffff)
    expect(isSafeExternalUrl('https://[::169.254.169.254]/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://[::127.0.0.1]/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://[::172.16.0.1]/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://[::a9fe:a9fe]/x.png')).toBe(false);
  });

  it('rejects 6to4-embedded blocked IPv4 ranges', () => {
    expect(isSafeExternalUrl('https://[2002:a9fe:a9fe::]/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://[2002:7f00:1::]/x.png')).toBe(false);
  });

  it('rejects NAT64-embedded blocked IPv4 ranges', () => {
    expect(isSafeExternalUrl('https://[64:ff9b::a9fe:a9fe]/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://[64:ff9b::7f00:1]/x.png')).toBe(false);
  });

  it('rejects IPv4-translated (SIIT) embedded blocked IPv4 ranges', () => {
    expect(isSafeExternalUrl('https://[::ffff:0:7f00:1]/x.png')).toBe(false);
    expect(isSafeExternalUrl('https://[::ffff:0:a9fe:a9fe]/x.png')).toBe(false);
  });

  it('allows IPv4-compatible / 6to4 / NAT64 / SIIT forms of public IPv4 addresses', () => {
    expect(isSafeExternalUrl('https://[::ffff:0:808:808]/x.png')).toBe(true);
    // 8.8.8.8 -> 0808:0808
    expect(isSafeExternalUrl('https://[::8.8.8.8]/x.png')).toBe(true);
    expect(isSafeExternalUrl('https://[2002:808:808::]/x.png')).toBe(true);
    expect(isSafeExternalUrl('https://[64:ff9b::808:808]/x.png')).toBe(true);
  });

  it('rejects NAT64 via the well-known alternate prefix (64:ff9b:1::/48)', () => {
    expect(isSafeExternalUrl('https://[64:ff9b:1::a9fe:a9fe]/x.png')).toBe(
      false
    );
  });

  it('is case-insensitive for embedded-IPv4 detection', () => {
    expect(isSafeExternalUrl('https://[::FFFF:169.254.169.254]/x.png')).toBe(
      false
    );
    expect(isSafeExternalUrl('https://[::FFFF:A9FE:A9FE]/x.png')).toBe(false);
  });

  it('does not false-positive on public IPv6 addresses whose low bits resemble a blocked IPv4 address', () => {
    // These are ordinary public unicast addresses; the low 32 bits happen to
    // look like 169.254.169.254, but the leading bits are non-zero and this
    // is not one of the recognized embedding shapes, so it must be allowed.
    expect(isSafeExternalUrl('https://[2607:f8b0:4004::a9fe:a9fe]/x.png')).toBe(
      true
    );
  });

  it('does not block Teredo addresses (known gap: embedded IPv4 is XOR-obfuscated, not directly readable)', () => {
    // 2001::ffff:ffff would XOR-decode to embedded IPv4 0.0.0.0; this just
    // documents current behavior for an encoding this check does not
    // attempt to decode.
    expect(isSafeExternalUrl('https://[2001::ffff:ffff]/x.png')).toBe(true);
  });
});
