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

// API Documentation: https://docs.mapbox.com/api/search/details/

export class PlaceDetailsTool extends MapboxApiBasedTool<
  typeof PlaceDetailsInputSchema,
  typeof PlaceDetailsOutputSchema
> {
  name = 'place_details_tool';
  description =
    'Retrieve detailed information about a specific place using its Mapbox ID. Use after search_and_geocode_tool, category_search_tool, or reverse_geocode_tool to get additional details such as photos, opening hours, ratings, phone numbers, and website URLs. Requires the mapbox_id field from a previous search result.';
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

  private formatOpenHours(openHours: Record<string, unknown>): string {
    const DAY_NAMES = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday'
    ];

    // Use weekday_text if the API provides it — already formatted per day
    if (Array.isArray(openHours['weekday_text'])) {
      const lines = (openHours['weekday_text'] as string[])
        .map((line) => `  ${line}`)
        .join('\n');
      return `Hours:\n${lines}`;
    }

    // Fall back to parsing periods array
    if (!Array.isArray(openHours['periods'])) return '';

    type Period = {
      open: { day: number; time: string };
      close?: { day: number; time: string };
    };

    const formatTime = (hhmm: string): string => {
      const h = parseInt(hhmm.slice(0, 2), 10);
      const m = hhmm.slice(2);
      const period = h < 12 ? 'AM' : 'PM';
      const hour = h % 12 || 12;
      return m === '00' ? `${hour} ${period}` : `${hour}:${m} ${period}`;
    };

    // Group periods by open day
    const byDay = new Map<number, string[]>();
    for (const period of openHours['periods'] as Period[]) {
      const day = period.open.day;
      const open = formatTime(period.open.time);
      const close = period.close ? formatTime(period.close.time) : 'midnight';
      const range = `${open} – ${close}`;
      const existing = byDay.get(day);
      if (existing) {
        existing.push(range);
      } else {
        byDay.set(day, [range]);
      }
    }

    const dayLines = DAY_NAMES.map((name, i) => {
      const ranges = byDay.get(i);
      return `  ${name}: ${ranges ? ranges.join(', ') : 'Closed'}`;
    });

    return `Hours:\n${dayLines.join('\n')}`;
  }

  private formatDetailsToText(data: PlaceDetailsOutput): string {
    const props = data.properties;
    const lines: string[] = [];

    // Name
    lines.push(`Name: ${props.name}`);

    // Address
    if (props.full_address) {
      lines.push(`Address: ${props.full_address}`);
    } else if (props.place_formatted) {
      lines.push(`Address: ${props.place_formatted}`);
    } else if (props.address) {
      lines.push(`Address: ${props.address}`);
    }

    // Coordinates from geometry
    if (data.geometry?.coordinates) {
      const [lng, lat] = data.geometry.coordinates;
      lines.push(`Coordinates: ${lat}, ${lng}`);
    }

    // Feature type and categories
    if (props.feature_type) {
      lines.push(`Type: ${props.feature_type}`);
    }
    if (props.poi_category && props.poi_category.length > 0) {
      lines.push(`Category: ${props.poi_category.join(', ')}`);
    }

    // Brand
    if (props.brand && props.brand.length > 0) {
      lines.push(`Brand: ${props.brand.join(', ')}`);
    }

    // Venue attributes (phone, website, social media)
    const metadata = props.metadata as Record<string, unknown> | undefined;
    if (metadata) {
      if (metadata['phone']) {
        lines.push(`Phone: ${metadata['phone']}`);
      }
      if (metadata['website']) {
        lines.push(`Website: ${metadata['website']}`);
      }
      if (
        metadata['social_media'] &&
        typeof metadata['social_media'] === 'object'
      ) {
        const social = metadata['social_media'] as Record<string, string>;
        const socialLinks = Object.entries(social)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        if (socialLinks) lines.push(`Social: ${socialLinks}`);
      }

      // Visit attributes (hours, rating, price)
      if (metadata['price']) {
        lines.push(`Price: ${metadata['price']}`);
      }
      if (metadata['rating'] !== undefined) {
        lines.push(`Rating: ${metadata['rating']}`);
      }
      if (metadata['review_count'] !== undefined) {
        lines.push(`Reviews: ${metadata['review_count']}`);
      }
      if (metadata['popularity'] !== undefined) {
        lines.push(
          `Popularity: ${Math.round((metadata['popularity'] as number) * 100)}%`
        );
      }
      if (
        metadata['open_hours'] &&
        typeof metadata['open_hours'] === 'object'
      ) {
        const formatted = this.formatOpenHours(
          metadata['open_hours'] as Record<string, unknown>
        );
        if (formatted) lines.push(formatted);
      }

      // Photos
      if (Array.isArray(metadata['primary_photo'])) {
        const photos = metadata['primary_photo'] as Array<
          Record<string, string>
        >;
        const photoUrls = photos
          .map((p) => p['url'] || p['thumb_url'])
          .filter(Boolean);
        if (photoUrls.length > 0) {
          lines.push(`Photos: ${photoUrls.join(', ')}`);
        }
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
      `${MapboxApiBasedTool.mapboxApiEndpoint}search/details/v1/retrieve/${encodeURIComponent(input.mapbox_id)}`
    );

    url.searchParams.append('access_token', accessToken);

    if (input.attribute_sets && input.attribute_sets.length > 0) {
      url.searchParams.append('attribute_sets', input.attribute_sets.join(','));
    }

    if (input.language) {
      url.searchParams.append('language', input.language);
    }

    if (input.worldview) {
      url.searchParams.append('worldview', input.worldview);
    }

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
