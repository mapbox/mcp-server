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
});
