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
  LegacyPlaceDetailsFeatureSchema,
  type PlaceDetailsOutput,
  type LegacyPlaceDetailsFeature
} from './PlaceDetailsTool.output.schema.js';

// API Documentation: https://docs.mapbox.com/api/search/places/
//
// This calls the Places API's Details/Retrieve endpoint, not the older,
// separate Details API (docs.mapbox.com/api/search/details/) this tool used
// previously. The Places API is Public Preview: its default quota is 1,000
// records/month per account and 100 records/sec, and its response contract
// may change without notice.
//
// The Places API only covers POIs. It rejects boundary/administrative
// mapbox_ids (neighborhoods, cities, regions) with a 422
// "Invalid mapbox_id format" error — confirmed live against the API with a
// city's mapbox_id from search_and_geocode_tool. Those IDs, and the
// enhanced Japan data the legacy API alone provides, still need the legacy
// Details API, so this tool falls back to it on that specific error rather
// than losing that capability outright.

export class PlaceDetailsTool extends MapboxApiBasedTool<
  typeof PlaceDetailsInputSchema,
  typeof PlaceDetailsOutputSchema
> {
  name = 'place_details_tool';
  description =
    'Retrieve detailed information about a specific place using its Mapbox ID. Use after search_and_geocode_tool, category_search_tool, or reverse_geocode_tool to get additional details such as photos, opening hours, phone numbers, and website URLs. Requires the mapbox_id field from a previous search result. Primarily covers points of interest (businesses, addresses, buildings); mapbox_ids for neighborhoods, cities, or other administrative boundaries are also supported but return more limited data (name, address, coordinates — no photos, hours, or contact info). The primary POI lookup is Public Preview with a default quota of 1,000 requests/month; contact Mapbox if you need a higher volume.';
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
    } else if (data.feature_type) {
      lines.push(`Type: ${data.feature_type}`);
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

  private errorResult(message: string): CallToolResult {
    return {
      content: [{ type: 'text', text: `Place Details API error: ${message}` }],
      isError: true
    };
  }

  private successResult(data: PlaceDetailsOutput): CallToolResult {
    return {
      content: [{ type: 'text', text: this.formatDetailsToText(data) }],
      structuredContent: data as unknown as Record<string, unknown>,
      isError: false
    };
  }

  /** Maps a legacy Details API `Feature` onto the flat Places API output shape. */
  private normalizeLegacyFeature(
    feature: LegacyPlaceDetailsFeature
  ): PlaceDetailsOutput {
    const props = feature.properties;
    const metadata = props.metadata as Record<string, unknown> | undefined;

    return this.validateOutput<PlaceDetailsOutput>({
      mapbox_id: props.mapbox_id,
      name: props.name,
      full_address:
        props.full_address ?? props.place_formatted ?? props.address,
      feature_type: props.feature_type,
      coordinates:
        props.coordinates ??
        (feature.geometry?.coordinates
          ? {
              longitude: feature.geometry.coordinates[0],
              latitude: feature.geometry.coordinates[1]
            }
          : undefined),
      bbox: props.bbox,
      context: props.context,
      categories: props.poi_category,
      brand:
        props.brand && props.brand.length > 0
          ? props.brand.join(', ')
          : undefined,
      phone: metadata?.['phone'] as string | undefined,
      website: metadata?.['website'] as string | undefined,
      metadata
    });
  }

  /**
   * Calls the legacy Details API, the only way to resolve boundary/
   * administrative mapbox_ids (and the source of enhanced Japan data).
   */
  private async fetchLegacyDetails(
    input: z.infer<typeof PlaceDetailsInputSchema>,
    accessToken: string
  ): Promise<
    { ok: true; data: PlaceDetailsOutput } | { ok: false; errorMessage: string }
  > {
    const url = new URL(
      `${MapboxApiBasedTool.mapboxApiEndpoint}search/details/v1/retrieve/${encodeURIComponent(input.mapbox_id)}`
    );
    url.searchParams.append('access_token', accessToken);

    // "basic" (name, feature_type, address, coordinates) must always be
    // requested — normalizeLegacyFeature() depends on those fields, even if
    // the caller's attribute_sets omits it.
    const attributeSets = new Set(['basic', ...(input.attribute_sets ?? [])]);
    url.searchParams.append(
      'attribute_sets',
      Array.from(attributeSets).join(',')
    );
    if (input.language) {
      url.searchParams.append('language', input.language);
    }
    if (input.worldview) {
      url.searchParams.append('worldview', input.worldview);
    }

    const response = await this.httpRequest(url.toString());
    if (!response.ok) {
      return { ok: false, errorMessage: await this.getErrorMessage(response) };
    }

    const rawFeature = LegacyPlaceDetailsFeatureSchema.parse(
      await response.json()
    );
    return { ok: true, data: this.normalizeLegacyFeature(rawFeature) };
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

    if (response.ok) {
      const data = this.validateOutput<PlaceDetailsOutput>(
        await response.json()
      );
      return this.successResult(data);
    }

    // The Places API rejects non-POI mapbox_ids (boundaries/neighborhoods/
    // cities/regions) with 422 "Invalid mapbox_id format" — fall back to the
    // legacy Details API, which still resolves those, instead of erroring.
    if (response.status === 422) {
      const legacyResult = await this.fetchLegacyDetails(input, accessToken);
      if (legacyResult.ok) {
        return this.successResult(legacyResult.data);
      }
      return this.errorResult(legacyResult.errorMessage);
    }

    return this.errorResult(await this.getErrorMessage(response));
  }
}
