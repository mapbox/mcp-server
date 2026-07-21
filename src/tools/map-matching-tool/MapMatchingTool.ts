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
      const errorMessage = await this.getErrorMessage(response);
      return {
        content: [
          {
            type: 'text',
            text: `Map Matching API error: ${errorMessage}`
          }
        ],
        isError: true
      };
    }

    const data = (await response.json()) as MapMatchingOutput;

    // The Map Matching API returns 200 with a non-"Ok" code (e.g. "NoMatch",
    // "NoSegment") when it can't match the trace, and omits tracepoints/matchings
    // in that case. Surface this as a tool error rather than structured content
    // so the MCP SDK's output schema validation is skipped for this response.
    if (data.code !== 'Ok') {
      return {
        content: [
          {
            type: 'text',
            text: `Map Matching API could not match the trace (code: ${data.code}). Try adjusting the coordinates or radiuses.`
          }
        ],
        isError: true
      };
    }

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
      // The API responded with code: 'Ok' but the payload still doesn't match
      // our output schema. Never return schema-violating structuredContent -
      // the MCP SDK rejects it with the same -32602 this fix is meant to avoid.
      const message =
        validationError instanceof Error
          ? validationError.message
          : String(validationError);
      this.log('warning', `Schema validation warning: ${message}`);

      return {
        content: [
          {
            type: 'text',
            text: `Map Matching API returned a response that didn't match the expected format: ${message}`
          }
        ],
        isError: true
      };
    }
  }
}
