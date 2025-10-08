// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { z } from 'zod';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { OutputSchema } from '../MapboxApiBasedTool.schema.js';
import { fetchClient } from '../../utils/fetchRequest.js';
import { IsochroneInputSchema } from './IsochroneTool.schema.js';

export class IsochroneTool extends MapboxApiBasedTool<
  typeof IsochroneInputSchema
> {
  name = 'isochrone_tool';
  description = `Computes areas that are reachable within a specified amount of time from a location, and returns the reachable regions as contours of Polygons or LineStrings in GeoJSON format that you can display on a map.
  Common use cases:
    - Show a user how far they can travel in X minutes from their current location
    - Determine whether a destination is within a certain travel time threshold
    - Compare travel ranges for different modes of transportation'`;
  annotations = {
    title: 'Isochrone Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };

  private fetch: typeof globalThis.fetch;

  constructor(fetch: typeof globalThis.fetch = fetchClient) {
    super({ inputSchema: IsochroneInputSchema });
    this.fetch = fetch;
  }

  protected async execute(
    input: z.infer<typeof IsochroneInputSchema>,
    accessToken: string
  ): Promise<z.infer<typeof OutputSchema>> {
    const url = new URL(
      `${MapboxApiBasedTool.mapboxApiEndpoint}isochrone/v1/${input.profile}/${input.coordinates.longitude}%2C${input.coordinates.latitude}`
    );
    url.searchParams.append('access_token', accessToken);
    if (
      (!input.contours_minutes || input.contours_minutes.length === 0) &&
      (!input.contours_meters || input.contours_meters.length === 0)
    ) {
      return {
        content: [
          {
            type: 'text',
            text: "At least one of 'contours_minutes' or 'contours_meters' must be provided"
          }
        ],
        isError: true
      };
    }
    if (input.contours_minutes && input.contours_minutes.length > 0) {
      url.searchParams.append(
        'contours_minutes',
        input.contours_minutes.join(',')
      );
    }
    if (input.contours_meters && input.contours_meters.length > 0) {
      url.searchParams.append(
        'contours_meters',
        input.contours_meters?.join(',')
      );
    }
    if (input.contours_colors && input.contours_colors.length > 0) {
      url.searchParams.append(
        'contours_colors',
        input.contours_colors.join(',')
      );
    }
    if (input.polygons) {
      url.searchParams.append('polygons', String(input.polygons));
    }
    if (input.denoise) {
      url.searchParams.append('denoise', String(input.denoise));
    }
    if (input.generalize) {
      url.searchParams.append('generalize', String(input.generalize));
    }
    if (input.exclude && input.exclude.length > 0) {
      url.searchParams.append('exclude', input.exclude.join(','));
    }
    if (input.depart_at) {
      url.searchParams.append('depart_at', input.depart_at);
    }

    const response = await this.fetch(url);

    if (!response.ok) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to calculate isochrones: ${response.status} ${response.statusText}`
          }
        ],
        isError: true
      };
    }

    const data = await response.json();
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      structuredContent: data as Record<string, unknown>,
      isError: false
    };
  }
}
