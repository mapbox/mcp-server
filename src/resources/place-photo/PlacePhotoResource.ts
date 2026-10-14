// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { MapboxApiBasedResource } from '../MapboxApiBasedResource.js';
import type { HttpRequest } from '../../utils/types.js';

const URI_PREFIX = 'mapbox://place-photo/';

/** Largest photo the resource returns; bigger ones are treated as missing. */
export const MAX_PLACE_PHOTO_BYTES = 512 * 1024;

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

  constructor(params: { httpRequest: HttpRequest }) {
    super(params);
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
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(id, { expires: now + CACHE_TTL_MS, photo });
    return photo;
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
    if (!photoUrl || !isPublicHttpsUrl(photoUrl)) return null;

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

/**
 * https on a DNS name, not an IP literal or a local name, so a bad photo URL
 * in the data can't make the server request something on its own network.
 */
function isPublicHttpsUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  if (url.port && url.port !== '443') return false;
  const host = url.hostname.toLowerCase();
  if (host.startsWith('[') || /^[\d.]+$/.test(host)) return false;
  if (
    !host.includes('.') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  )
    return false;
  return host !== 'localhost' && !host.endsWith('.localhost');
}
