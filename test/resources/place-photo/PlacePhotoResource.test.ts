// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, vi } from 'vitest';
import {
  PlacePhotoResource,
  MAX_PLACE_PHOTO_BYTES,
  MAX_PLACE_PHOTO_CACHE_BYTES
} from '../../../src/resources/place-photo/PlacePhotoResource.js';

const ID = Buffer.from(
  'urn:mbxpoi:7a4b2c1d-0000-4000-8000-000000000001'
).toString('base64');
const URI = `mapbox://place-photo/${encodeURIComponent(ID)}`;
const PHOTO_URL = 'https://dyn.mktgcdn.com/p/photo.jpg';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

function details(photos: unknown) {
  return new Response(JSON.stringify({ mapbox_id: ID, photos }), {
    headers: { 'content-type': 'application/json' }
  });
}

function image(body: Uint8Array, type = 'image/jpeg', status = 200) {
  return new Response(body, { status, headers: { 'content-type': type } });
}

// A public address, so no test resolves a real hostname.
const publicDns = async () => ['93.184.215.14'];

function setup(...responses: Response[]) {
  const httpRequest = vi.fn();
  for (const r of responses) httpRequest.mockResolvedValueOnce(r);
  return {
    httpRequest,
    resource: new PlacePhotoResource({ httpRequest, lookupHost: publicDns })
  };
}

function placeId(n: number) {
  const uuid = `7a4b2c1d-0000-4000-8000-${String(n).padStart(12, '0')}`;
  return Buffer.from(`urn:mbxpoi:${uuid}`).toString('base64');
}

describe('PlacePhotoResource', () => {
  it("returns the place's first photo as a base64 image", async () => {
    const { httpRequest, resource } = setup(
      details([{ url: PHOTO_URL }, { url: 'https://other.example/2.jpg' }]),
      image(JPEG)
    );

    const result = await resource.read(URI);

    expect(result.contents[0]).toEqual({
      uri: URI,
      mimeType: 'image/jpeg',
      blob: JPEG.toString('base64')
    });
    // Looked up by id on the Places API, then the photo URL it returned.
    expect(String(httpRequest.mock.calls[0][0])).toContain(
      `places/v1/details/retrieve/${encodeURIComponent(ID)}`
    );
    expect(httpRequest.mock.calls[1][0]).toBe(PHOTO_URL);
    expect(httpRequest.mock.calls[1][1]).toMatchObject({ redirect: 'manual' });
  });

  it('caches by id, including misses', async () => {
    const { httpRequest, resource } = setup(details([]));
    await resource.read(URI);
    const second = await resource.read(URI);
    expect(second.contents[0]).toMatchObject({ mimeType: 'text/plain' });
    expect(httpRequest).toHaveBeenCalledTimes(1);
  });

  it('rejects ids that are not native Places ids', async () => {
    const osm = Buffer.from('urn:mbxpoi-osm:n123').toString('base64');
    const { httpRequest, resource } = setup();
    await expect(
      resource.read(`mapbox://place-photo/${encodeURIComponent(osm)}`)
    ).rejects.toThrow('Not a Places API mapbox_id');
    const mapboxN = Buffer.from('urn:mbxpoi:mapbox-n408854').toString('base64');
    await expect(
      resource.read(`mapbox://place-photo/${encodeURIComponent(mapboxN)}`)
    ).rejects.toThrow('Not a Places API mapbox_id');
    await expect(
      resource.read('mapbox://place-photo/https%3A%2F%2Fevil.example%2F')
    ).rejects.toThrow();
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it.each([
    ['http', 'http://cdn.example.com/a.jpg'],
    ['an IP address', 'https://169.254.169.254/latest/meta-data'],
    ['an IPv6 address', 'https://[::1]/a.jpg'],
    ['localhost', 'https://localhost/a.jpg'],
    ['a single-label host', 'https://intranet/a.jpg'],
    ['a non-default port', 'https://cdn.example.com:8443/a.jpg'],
    ['credentials', 'https://user:pw@cdn.example.com/a.jpg']
  ])('never fetches a photo URL with %s', async (_label, url) => {
    const { httpRequest, resource } = setup(details([{ url }]));
    const result = await resource.read(URI);
    expect(result.contents[0]).toMatchObject({ mimeType: 'text/plain' });
    expect(httpRequest).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a private address', ['10.0.0.5']],
    ['loopback among public addresses', ['93.184.215.14', '127.0.0.1']],
    ['an IPv6 unique-local address', ['fd00::1']],
    ['no addresses', []]
  ])('never fetches a photo whose host resolves to %s', async (_l, addrs) => {
    const httpRequest = vi
      .fn()
      .mockResolvedValueOnce(details([{ url: PHOTO_URL }]));
    const lookupHost = vi.fn(async () => addrs);
    const resource = new PlacePhotoResource({ httpRequest, lookupHost });
    const result = await resource.read(URI);
    expect(result.contents[0]).toMatchObject({ mimeType: 'text/plain' });
    expect(lookupHost).toHaveBeenCalledWith('dyn.mktgcdn.com');
    expect(httpRequest).toHaveBeenCalledTimes(1);
  });

  it('never fetches a photo whose host fails to resolve', async () => {
    const httpRequest = vi
      .fn()
      .mockResolvedValueOnce(details([{ url: PHOTO_URL }]));
    const lookupHost = vi.fn().mockRejectedValue(new Error('ENOTFOUND'));
    const resource = new PlacePhotoResource({ httpRequest, lookupHost });
    const result = await resource.read(URI);
    expect(result.contents[0]).toMatchObject({ mimeType: 'text/plain' });
    expect(httpRequest).toHaveBeenCalledTimes(1);
  });

  it('keeps the shared cache under its byte cap by dropping the oldest photos', async () => {
    // Just under the per-photo cap, so the byte cap binds before the
    // entry cap: base64 makes each about 1.33 MB.
    const big = new Uint8Array(MAX_PLACE_PHOTO_BYTES - 1);
    const fits = Math.floor(
      MAX_PLACE_PHOTO_CACHE_BYTES / (big.length * (4 / 3))
    );
    const httpRequest = vi.fn();
    const resource = new PlacePhotoResource({
      httpRequest,
      lookupHost: publicDns
    });
    const uriFor = (n: number) =>
      `mapbox://place-photo/${encodeURIComponent(placeId(n))}`;
    for (let n = 0; n <= fits; n++) {
      httpRequest
        .mockResolvedValueOnce(details([{ url: PHOTO_URL }]))
        .mockResolvedValueOnce(image(big));
      await resource.read(uriFor(n));
    }
    expect(httpRequest).toHaveBeenCalledTimes(2 * (fits + 1));

    // The newest is still cached; the oldest was dropped to make room.
    await resource.read(uriFor(fits));
    expect(httpRequest).toHaveBeenCalledTimes(2 * (fits + 1));
    httpRequest
      .mockResolvedValueOnce(details([{ url: PHOTO_URL }]))
      .mockResolvedValueOnce(image(big));
    await resource.read(uriFor(0));
    expect(httpRequest).toHaveBeenCalledTimes(2 * (fits + 2));
  });

  it.each([
    ['SVG', image(JPEG, 'image/svg+xml')],
    ['HTML', image(JPEG, 'text/html')],
    ['a redirect', image(new Uint8Array(), 'image/jpeg', 302)],
    ['an error', image(new Uint8Array(), 'image/jpeg', 404)],
    ['an empty body', image(new Uint8Array())],
    ['an oversized body', image(new Uint8Array(MAX_PLACE_PHOTO_BYTES + 1))]
  ])('treats %s as no photo', async (_label, response) => {
    const { resource } = setup(details([{ url: PHOTO_URL }]), response);
    const result = await resource.read(URI);
    expect(result.contents[0]).toMatchObject({ mimeType: 'text/plain' });
  });

  it('treats a failed photo request as no photo', async () => {
    const httpRequest = vi
      .fn()
      .mockResolvedValueOnce(details([{ url: PHOTO_URL }]))
      .mockRejectedValueOnce(new Error('timeout'));
    const result = await new PlacePhotoResource({
      httpRequest,
      lookupHost: publicDns
    }).read(URI);
    expect(result.contents[0]).toMatchObject({ mimeType: 'text/plain' });
  });

  it('treats a Places API error as no photo', async () => {
    const { resource } = setup(new Response('quota', { status: 429 }));
    const result = await resource.read(URI);
    expect(result.contents[0]).toMatchObject({ mimeType: 'text/plain' });
  });
});
