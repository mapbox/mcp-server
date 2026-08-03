// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { z } from 'zod';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { HttpRequest } from '../../utils/types.js';
import type { ToolExecutionContext } from '../../utils/tracing.js';
import { PlaceDetailsInputSchema } from './PlaceDetailsTool.input.schema.js';
import {
  PlaceDetailsOutputSchema,
  type PlaceDetailsOutput
} from './PlaceDetailsTool.output.schema.js';

// API Documentation: https://docs.mapbox.com/api/search/places/
//
// This calls the Places API's Details/Retrieve endpoint, not the older,
// separate Details API (docs.mapbox.com/api/search/details/) this tool used
// previously. The Places API is Public Preview: its default quota is 1,000
// records/month per account and 100 records/sec, and its response contract
// may change without notice.

export class PlaceDetailsTool extends MapboxApiBasedTool<
  typeof PlaceDetailsInputSchema,
  typeof PlaceDetailsOutputSchema
> {
  name = 'place_details_tool';
  description =
    'Retrieve detailed information about a specific place using its Mapbox ID. Use after search_and_geocode_tool, category_search_tool, or reverse_geocode_tool to get additional details such as photos, opening hours, phone numbers, and website URLs. Requires the mapbox_id field from a previous search result.';
  annotations = {
    title: 'Place Details Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };

  constructor(params: { httpRequest: HttpRequest }) {
    super({
      inputSchema: PlaceDetailsInputSchema,
      outputSchema: PlaceDetailsOutputSchema,
      httpRequest: params.httpRequest
    });
  }

  /** `opening_hours` is an OSM opening_hours string, e.g. "Mo 09:00-23:45; Tu 09:00-23:45; ...". */
  private formatOpeningHours(openingHours: string): string {
    const parts = openingHours
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) return '';

    const lines = parts.map((part) => `  ${part}`).join('\n');
    return `Hours:\n${lines}`;
  }

  private formatDetailsToText(data: PlaceDetailsOutput): string {
    const lines: string[] = [];

    lines.push(`Name: ${data.name}`);

    if (data.full_address) {
      lines.push(`Address: ${data.full_address}`);
    }

    if (data.coordinates) {
      lines.push(
        `Coordinates: ${data.coordinates.latitude}, ${data.coordinates.longitude}`
      );
    }

    if (data.primary_category) {
      lines.push(`Type: ${data.primary_category}`);
    }
    if (data.categories && data.categories.length > 0) {
      lines.push(`Category: ${data.categories.join(', ')}`);
    }

    if (data.brand) {
      lines.push(`Brand: ${data.brand}`);
    }

    if (data.phone) {
      lines.push(`Phone: ${data.phone}`);
    }
    if (data.website) {
      lines.push(`Website: ${data.website}`);
    }

    if (
      data.score?.popularity !== undefined &&
      data.score?.popularity !== null
    ) {
      lines.push(`Popularity: ${Math.round(data.score.popularity * 100)}%`);
    }

    if (data.permanently_closed) {
      lines.push('Status: Permanently closed');
    }

    if (data.opening_hours) {
      const formatted = this.formatOpeningHours(data.opening_hours);
      if (formatted) lines.push(formatted);
    }

    if (data.photos && data.photos.length > 0) {
      const urls = data.photos.map((photo) => photo.url).filter(Boolean);
      if (urls.length > 0) {
        lines.push(`Photos: ${urls.join(', ')}`);
      }
    }

    return lines.join('\n');
  }

  protected async execute(
    input: z.infer<typeof PlaceDetailsInputSchema>,
    accessToken: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: ToolExecutionContext
  ): Promise<CallToolResult> {
    const url = new URL(
      `${MapboxApiBasedTool.mapboxApiEndpoint}places/v1/details/retrieve/${encodeURIComponent(input.mapbox_id)}`
    );

    url.searchParams.append('access_token', accessToken);

    const response = await this.httpRequest(url.toString());

    if (!response.ok) {
      const errorMessage = await this.getErrorMessage(response);
      return {
        content: [
          {
            type: 'text',
            text: `Place Details API error: ${errorMessage}`
          }
        ],
        isError: true
      };
    }

    const rawData = await response.json();
    const data = this.validateOutput<PlaceDetailsOutput>(rawData);

    return {
      content: [{ type: 'text', text: this.formatDetailsToText(data) }],
      structuredContent: data as unknown as Record<string, unknown>,
      isError: false
    };
  }
}
