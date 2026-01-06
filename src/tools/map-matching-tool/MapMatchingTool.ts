// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { URLSearchParams } from 'node:url';
import type { z } from 'zod';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MapMatchingInputSchema } from './MapMatchingTool.input.schema.js';
import {
  MapMatchingOutputSchema,
  type MapMatchingOutput
} from './MapMatchingTool.output.schema.js';
import type { HttpRequest } from '../../utils/types.js';

// Docs: https://docs.mapbox.com/api/navigation/map-matching/

export class MapMatchingTool extends MapboxApiBasedTool<
  typeof MapMatchingInputSchema,
  typeof MapMatchingOutputSchema
> {
  name = 'map_matching_tool';
  description =
    'Snap GPS traces to roads using Mapbox Map Matching API. Takes noisy/inaccurate ' +
    'coordinate sequences (2-100 points) and returns clean routes aligned with actual ' +
    'roads, bike paths, or walkways. Useful for analyzing recorded trips, cleaning ' +
    'fleet tracking data, or processing fitness activity traces. Returns confidence ' +
    'scores, matched geometry, and optional traffic/speed annotations.';
  annotations = {
    title: 'Map Matching Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };

  constructor(params: { httpRequest: HttpRequest }) {
    super({
      inputSchema: MapMatchingInputSchema,
      outputSchema: MapMatchingOutputSchema,
      httpRequest: params.httpRequest
    });
  }

  protected async execute(
    input: z.infer<typeof MapMatchingInputSchema>,
    accessToken: string
  ): Promise<CallToolResult> {
    // Validate timestamps array length matches coordinates
    if (
      input.timestamps &&
      input.timestamps.length !== input.coordinates.length
    ) {
      return {
        content: [
          {
            type: 'text',
            text: 'The timestamps array must have the same length as the coordinates array'
          }
        ],
        isError: true
      };
    }

    // Validate radiuses array length matches coordinates
    if (input.radiuses && input.radiuses.length !== input.coordinates.length) {
      return {
        content: [
          {
            type: 'text',
            text: 'The radiuses array must have the same length as the coordinates array'
          }
        ],
        isError: true
      };
    }

    // Build coordinate string: "lon1,lat1;lon2,lat2;..."
    const coordsString = input.coordinates
      .map((coord) => `${coord.longitude},${coord.latitude}`)
      .join(';');

    // Build query parameters
    const queryParams = new URLSearchParams();
    queryParams.append('access_token', accessToken);
    queryParams.append('geometries', input.geometries);
    queryParams.append('overview', input.overview);

    // Add timestamps if provided (semicolon-separated)
    if (input.timestamps) {
      queryParams.append('timestamps', input.timestamps.join(';'));
    }

    // Add radiuses if provided (semicolon-separated)
    if (input.radiuses) {
      queryParams.append('radiuses', input.radiuses.join(';'));
    }

    // Add annotations if provided (comma-separated)
    if (input.annotations && input.annotations.length > 0) {
      queryParams.append('annotations', input.annotations.join(','));
    }

    const url = `${MapboxApiBasedTool.mapboxApiEndpoint}matching/v5/mapbox/${input.profile}/${coordsString}?${queryParams.toString()}`;

    const response = await this.httpRequest(url);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Request failed with status ${response.status}: ${response.statusText}`;

      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.message) {
          errorMessage = `${errorMessage} - ${errorJson.message}`;
        }
      } catch {
        if (errorText) {
          errorMessage = `${errorMessage} - ${errorText}`;
        }
      }

      return {
        content: [{ type: 'text', text: errorMessage }],
        isError: true
      };
    }

    const data = (await response.json()) as MapMatchingOutput;

    // Validate the response against our output schema
    try {
      const validatedData = MapMatchingOutputSchema.parse(data);

      return {
        content: [
          { type: 'text', text: JSON.stringify(validatedData, null, 2) }
        ],
        structuredContent: validatedData,
        isError: false
      };
    } catch (validationError) {
      // If validation fails, return the raw result anyway with a warning
      this.log(
        'warning',
        `Schema validation warning: ${validationError instanceof Error ? validationError.message : String(validationError)}`
      );

      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        structuredContent: data,
        isError: false
      };
    }
  }
}
