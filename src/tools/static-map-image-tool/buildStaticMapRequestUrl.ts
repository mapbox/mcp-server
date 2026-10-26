// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { z } from 'zod';
import type {
  StaticMapImageInputSchema,
  OverlaySchema
} from './StaticMapImageTool.input.schema.js';

// encodeURIComponent leaves (, ), !, ', and * unescaped (they're valid in a
// URI component per RFC 3986's "unreserved" carve-out from the older
// escape() behaviour). Every overlay value below is embedded inside a
// path segment delimited by literal parentheses (e.g. `url-<value>(lon,lat)`,
// `geojson(<value>)`), so a raw `)` in the value can terminate that segment
// early from the Static Images API's own overlay-syntax parser's point of
// view, even though this value already passed URL/JSON validation on our
// side. Escape those characters explicitly so both parsers agree on where
// the value actually ends.
export function encodeOverlayComponent(value: string): string {
  return encodeURIComponent(value).replace(
    /[()!'*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

export function encodeOverlay(overlay: z.infer<typeof OverlaySchema>): string {
  switch (overlay.type) {
    case 'marker': {
      const size = overlay.size === 'large' ? 'pin-l' : 'pin-s';
      let marker = size;

      if (overlay.label) {
        marker += `-${overlay.label}`;
      }

      if (overlay.color) {
        marker += `+${overlay.color}`;
      }

      return `${marker}(${overlay.longitude},${overlay.latitude})`;
    }

    case 'custom-marker': {
      const encodedUrl = encodeOverlayComponent(overlay.url);
      return `url-${encodedUrl}(${overlay.longitude},${overlay.latitude})`;
    }

    case 'path': {
      let path = `path-${overlay.strokeWidth}`;

      if (overlay.strokeColor) {
        path += `+${overlay.strokeColor}`;
        if (overlay.strokeOpacity !== undefined) {
          path += `-${overlay.strokeOpacity}`;
        }
      }

      if (overlay.fillColor) {
        path += `+${overlay.fillColor}`;
        if (overlay.fillOpacity !== undefined) {
          path += `-${overlay.fillOpacity}`;
        }
      }

      // URL encode the polyline to handle special characters
      return `${path}(${encodeOverlayComponent(overlay.encodedPolyline)})`;
    }

    case 'geojson': {
      const geojsonString = JSON.stringify(overlay.data);
      return `geojson(${encodeOverlayComponent(geojsonString)})`;
    }
  }
}

export function getStaticMapMimeType(
  style: string
): 'image/jpeg' | 'image/png' {
  return style.includes('satellite') ? 'image/jpeg' : 'image/png';
}

export interface StaticMapRequestUrls {
  /** The request URL without the access token, safe to show the model. */
  publicUrl: string;
  /** The same URL with the access token, for the request itself. */
  url: string;
}

/**
 * Builds the Static Images API request for a given input. Shared by
 * StaticMapImageTool and ToolResponseResource, which fetches a large image
 * again from its `mapbox://response/` ref. The API renders the same image
 * for the same parameters, so the two requests return the same bytes.
 */
export function buildStaticMapRequestUrl(params: {
  input: z.infer<typeof StaticMapImageInputSchema>;
  accessToken: string;
  apiEndpoint: string;
}): StaticMapRequestUrls {
  const { input, accessToken, apiEndpoint } = params;
  const { longitude: lng, latitude: lat } = input.center;
  const { width, height } = input.size;

  let overlayString = '';
  if (input.overlays && input.overlays.length > 0) {
    overlayString = input.overlays.map(encodeOverlay).join(',') + '/';
  }

  const density = input.highDensity ? '@2x' : '';
  const encodedStyle = input.style.split('/').map(encodeURIComponent).join('/');
  const publicUrl = `${apiEndpoint}styles/v1/${encodedStyle}/static/${overlayString}${lng},${lat},${input.zoom}/${width}x${height}${density}`;
  const url = `${publicUrl}?access_token=${accessToken}`;

  return { publicUrl, url };
}
