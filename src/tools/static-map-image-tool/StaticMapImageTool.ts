// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { z } from 'zod';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import { fetchClient } from '../../utils/fetchRequest.js';
import { StaticMapImageInputSchema } from './StaticMapImageTool.schema.js';
import type { OverlaySchema } from './StaticMapImageTool.schema.js';

export class StaticMapImageTool extends MapboxApiBasedTool<
  typeof StaticMapImageInputSchema
> {
  name = 'static_map_image_tool';
  description =
    'Generates a static map image from Mapbox Static Images API. Supports center coordinates, zoom level (0-22), image size (up to 1280x1280), various Mapbox styles, and overlays (markers, paths, GeoJSON). Returns PNG for vector styles, JPEG for raster-only styles.';
  annotations = {
    title: 'Static Map Image Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };

  constructor(private fetch: typeof globalThis.fetch = fetchClient) {
    super({ inputSchema: StaticMapImageInputSchema });
  }

  private encodeOverlay(overlay: z.infer<typeof OverlaySchema>): string {
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
        const encodedUrl = encodeURIComponent(overlay.url);
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
        return `${path}(${encodeURIComponent(overlay.encodedPolyline)})`;
      }

      case 'geojson': {
        const geojsonString = JSON.stringify(overlay.data);
        return `geojson(${encodeURIComponent(geojsonString)})`;
      }
    }
  }

  protected async execute(
    input: z.infer<typeof StaticMapImageInputSchema>,
    accessToken: string
  ): Promise<unknown> {
    const { longitude: lng, latitude: lat } = input.center;
    const { width, height } = input.size;

    // Build overlay string
    let overlayString = '';
    if (input.overlays && input.overlays.length > 0) {
      const encodedOverlays = input.overlays.map((overlay) => {
        return this.encodeOverlay(overlay);
      });
      overlayString = encodedOverlays.join(',') + '/';
    }

    const density = input.highDensity ? '@2x' : '';
    const url = `${MapboxApiBasedTool.mapboxApiEndpoint}styles/v1/${input.style}/static/${overlayString}${lng},${lat},${input.zoom}/${width}x${height}${density}?access_token=${accessToken}`;

    const response = await this.fetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch map image: ${response.status} ${response.statusText}`
      );
    }

    const buffer = await response.arrayBuffer();

    const base64Data = Buffer.from(buffer).toString('base64');

    // Determine MIME type based on style (raster-only styles return JPEG)
    const isRasterStyle = input.style.includes('satellite');
    const mimeType = isRasterStyle ? 'image/jpeg' : 'image/png';

    return {
      type: 'image',
      data: base64Data,
      mimeType
    };
  }
}
