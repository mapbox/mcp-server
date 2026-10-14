// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { lookup } from 'node:dns/promises';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { MapboxApiBasedResource } from '../MapboxApiBasedResource.js';
import type { HttpRequest } from '../../utils/types.js';
import {
  isPublicIpAddress,
  parseSafeExternalUrl
} from '../../utils/urlSafety.js';

const URI_PREFIX = 'mapbox://place-photo/';

/**
 * Largest photo the resource returns; bigger ones are treated as missing.
 * Place Details photos are full-size originals: Union Square's ran 100 to
 * 600 KB, so a smaller cap would drop most of them.
 */
export const MAX_PLACE_PHOTO_BYTES = 1024 * 1024;

/**
 * The cache is shared by everyone using the server process, so it's capped
 * by size (base64, as stored) as well as by entries.
 */
export const MAX_PLACE_PHOTO_CACHE_BYTES = 20 * 1024 * 1024;

const PHOTO_FETCH_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

// Raster types an <img> or CSS background can show. SVG is left out: it's a
// document that can carry script, and thumbnails never need it.
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);

interface CachedPhoto {
  expires: number;
  photo: { mimeType: string; base64: string } | null;
}

/** Resolves a hostname to every address it points at. */
export type LookupHost = (hostname: string) => Promise<string[]>;

const lookupAll: LookupHost = async (hostname) =>
  (await lookup(hostname, { all: true })).map((a) => a.address);

/**
 * A POI's first Place Details photo, proxied through the server for the map
 * app's results panel.
 *
 * Place Details photos are hosted wherever the business's own site hosts
 * them (Yext, Webflow and so on), so the map app's CSP can't list their
 * hosts, and allowing any https: host would also allow scripts from
 * anywhere. Instead the page reads this resource through the host
 * (`resources/read`) and shows the image as a `data:` URL.
 *
 * The URI carries only a mapbox_id, never a URL: the server looks the place
 * up itself and fetches the photo URL Place Details returns, so the page
 * can't point the server at arbitrary hosts.
 */
export class PlacePhotoResource extends MapboxApiBasedResource {
  readonly uri = `${URI_PREFIX}{id}`;
  readonly name = 'Mapbox Place Photo';
  readonly description =
    "The first photo of a POI from Place Details, as an image, for the map app's results panel. " +
    'Read with mapbox://place-photo/{mapbox_id}.';
  readonly mimeType = 'image/jpeg';

  private readonly cache = new Map<string, CachedPhoto>();
  private cacheBytes = 0;
  private readonly lookupHost: LookupHost;

  constructor(params: { httpRequest: HttpRequest; lookupHost?: LookupHost }) {
    super(params);
    this.lookupHost = params.lookupHost ?? lookupAll;
  }

  protected async execute(
    uri: string,
    accessToken: string
  ): Promise<ReadResourceResult> {
    const id = decodeURIComponent(uri.slice(URI_PREFIX.length));
    if (!isPlacesApiId(id)) {
      throw new Error('Not a Places API mapbox_id');
    }

    const photo = await this.getPhoto(id, accessToken);
    if (!photo) {
      return {
        contents: [{ uri, mimeType: 'text/plain', text: 'No photo available' }]
      };
    }
    return {
      contents: [{ uri, mimeType: photo.mimeType, blob: photo.base64 }]
    };
  }

  private async getPhoto(
    id: string,
    accessToken: string
  ): Promise<CachedPhoto['photo']> {
    const now = Date.now();
    const cached = this.cache.get(id);
    if (cached && cached.expires > now) return cached.photo;

    const photo = await this.fetchPhoto(id, accessToken);
    // Places are public data, so one cache serves every caller. Misses are
    // cached too, so a place without a photo isn't looked up on every render.
    this.evict(id);
    const size = photo?.base64.length ?? 0;
    while (
      this.cache.size > 0 &&
      (this.cache.size >= CACHE_MAX_ENTRIES ||
        this.cacheBytes + size > MAX_PLACE_PHOTO_CACHE_BYTES)
    ) {
      this.evict(this.cache.keys().next().value as string);
    }
    this.cache.set(id, { expires: now + CACHE_TTL_MS, photo });
    this.cacheBytes += size;
    return photo;
  }

  private evict(id: string): void {
    const entry = this.cache.get(id);
    if (!entry) return;
    this.cacheBytes -= entry.photo?.base64.length ?? 0;
    this.cache.delete(id);
  }

  private async fetchPhoto(
    id: string,
    accessToken: string
  ): Promise<CachedPhoto['photo']> {
    const detailsUrl = new URL(
      `${MapboxApiBasedResource.mapboxApiEndpoint}places/v1/details/retrieve/${encodeURIComponent(id)}`
    );
    detailsUrl.searchParams.append('access_token', accessToken);
    const details = await this.httpRequest(detailsUrl.toString());
    if (!details.ok) return null;
    const data = (await details.json()) as {
      photos?: Array<{ url?: unknown }>;
    };
    const photoUrl = data.photos?.find((p) => typeof p?.url === 'string')
      ?.url as string | undefined;
    if (!photoUrl || !(await this.isPublicPhotoUrl(photoUrl))) return null;

    let response: Response;
    try {
      response = await this.httpRequest(photoUrl, {
        // A redirect could lead anywhere, including hosts isPublicHttpsUrl
        // would have rejected, so treat it as no photo.
        redirect: 'manual',
        signal: AbortSignal.timeout(PHOTO_FETCH_TIMEOUT_MS)
      });
    } catch {
      return null;
    }
    if (response.status !== 200) return null;

    const mimeType = (response.headers?.get('content-type') ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (!ALLOWED_TYPES.has(mimeType)) return null;
    const declared = Number(response.headers?.get('content-length'));
    if (declared > MAX_PLACE_PHOTO_BYTES) return null;

    const bytes = await readCapped(response, MAX_PLACE_PHOTO_BYTES);
    if (!bytes || bytes.length === 0) return null;
    return { mimeType, base64: bytes.toString('base64') };
  }

  /**
   * https on the default port, a public DNS name (not an IP literal or a
   * local name), and every address it resolves to public, so a bad photo
   * URL in the data can't make the server request something on its own
   * network. The fetch resolves the name again, so a host that changes its
   * answer in between can still get through; the request can't be read
   * back either way (no redirects, image types only).
   */
  private async isPublicPhotoUrl(value: string): Promise<boolean> {
    const url = parseSafeExternalUrl(value);
    if (!url || url.username || url.password) return false;
    if (url.port && url.port !== '443') return false;
    const host = url.hostname;
    if (host.startsWith('[') || isIpv4Literal(host)) return false;
    try {
      const addresses = await this.lookupHost(host);
      return addresses.length > 0 && addresses.every(isPublicIpAddress);
    } catch {
      return false;
    }
  }
}

function isIpv4Literal(host: string): boolean {
  return /^[\d.]+$/.test(host);
}

/** Reads a body, giving up (null) as soon as it passes `limit` bytes. */
async function readCapped(
  response: Response,
  limit: number
): Promise<Buffer | null> {
  const reader = response.body?.getReader();
  if (!reader) {
    const whole = Buffer.from(await response.arrayBuffer());
    return whole.length > limit ? null : whole;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

const PLACES_ID =
  /^urn:mbxpoi:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Native Places ids decode to "urn:mbxpoi:<uuid>". Others, including
 * OSM-sourced ids and "urn:mbxpoi:mapbox-n<id>", 422 the API.
 */
function isPlacesApiId(id: string): boolean {
  if (!/^[A-Za-z0-9+/_=-]{8,200}$/.test(id)) return false;
  return PLACES_ID.test(Buffer.from(id, 'base64').toString('utf8'));
}
