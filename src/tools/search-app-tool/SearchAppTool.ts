// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { HttpRequest } from '../../utils/types.js';
import {
  SearchAndGeocodeAppInputSchema,
  CategorySearchAppInputSchema
} from './SearchAppTool.input.schema.js';

// Docs:
//   https://docs.mapbox.com/api/search/search-box/#search-request
//   https://docs.mapbox.com/api/search/search-box/#category-search

interface SearchFeature {
  type: 'Feature';
  geometry?: { type: string; coordinates: [number, number] };
  properties?: {
    name?: string;
    full_address?: string;
    place_formatted?: string;
    poi_category?: string[];
    feature_type?: string;
  };
}

interface SearchResponse {
  type?: 'FeatureCollection';
  features?: SearchFeature[];
}

const SEARCH_APP_META = {
  ui: {
    resourceUri: 'ui://mapbox/search-app/index.html',
    csp: {
      connectDomains: ['https://*.mapbox.com', 'https://events.mapbox.com'],
      resourceDomains: ['https://api.mapbox.com']
    }
  }
};

function shapeResults(features: SearchFeature[]) {
  return features
    .filter(
      (
        f
      ): f is SearchFeature & {
        geometry: { type: string; coordinates: [number, number] };
      } =>
        !!f.geometry?.coordinates &&
        Array.isArray(f.geometry.coordinates) &&
        f.geometry.coordinates.length === 2
    )
    .map((f, i) => ({
      index: i + 1,
      name: f.properties?.name ?? 'Result',
      address:
        f.properties?.full_address ??
        f.properties?.place_formatted ??
        undefined,
      category: f.properties?.poi_category?.[0],
      location: f.geometry.coordinates
    }));
}

// ---------------------------------------------------------------------------
// SearchAndGeocodeAppTool — free-text search/geocode
// ---------------------------------------------------------------------------
export class SearchAndGeocodeAppTool extends MapboxApiBasedTool<
  typeof SearchAndGeocodeAppInputSchema
> {
  name = 'search_and_geocode_app_tool';
  description =
    'Search for places by free-text query (place name, address, POI) and render the results as pins on an interactive Mapbox GL JS map (MCP App). ' +
    'Use this when the user asks to find or locate places — "find coffee shops near me", "where is the closest pharmacy", etc.';
  annotations = {
    title: 'Search and Geocode App Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };
  readonly meta = SEARCH_APP_META;

  constructor(params: { httpRequest: HttpRequest }) {
    super({
      inputSchema: SearchAndGeocodeAppInputSchema,
      httpRequest: params.httpRequest
    });
  }

  protected async execute(
    input: z.infer<typeof SearchAndGeocodeAppInputSchema>,
    accessToken: string
  ): Promise<CallToolResult> {
    const url = new URL(
      `${MapboxApiBasedTool.mapboxApiEndpoint}search/searchbox/v1/forward`
    );
    url.searchParams.set('access_token', accessToken);
    url.searchParams.set('q', input.q);
    url.searchParams.set('limit', String(input.limit));
    if (input.proximity) {
      url.searchParams.set(
        'proximity',
        `${input.proximity.longitude},${input.proximity.latitude}`
      );
    }

    return runSearch({
      httpRequest: this.httpRequest,
      getErrorMessage: (r) => this.getErrorMessage(r),
      url,
      context: {
        kind: 'search',
        query: input.q,
        proximity: input.proximity
      }
    });
  }
}

// ---------------------------------------------------------------------------
// CategorySearchAppTool — category-filtered search
// ---------------------------------------------------------------------------
export class CategorySearchAppTool extends MapboxApiBasedTool<
  typeof CategorySearchAppInputSchema
> {
  name = 'category_search_app_tool';
  description =
    'Search for places by canonical category (restaurant, cafe, hotel, …) and render the results as pins on an interactive Mapbox GL JS map (MCP App). ' +
    'Use this when the user wants a list of places of a specific type near a location.';
  annotations = {
    title: 'Category Search App Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };
  readonly meta = SEARCH_APP_META;

  constructor(params: { httpRequest: HttpRequest }) {
    super({
      inputSchema: CategorySearchAppInputSchema,
      httpRequest: params.httpRequest
    });
  }

  protected async execute(
    input: z.infer<typeof CategorySearchAppInputSchema>,
    accessToken: string
  ): Promise<CallToolResult> {
    const url = new URL(
      `${MapboxApiBasedTool.mapboxApiEndpoint}search/searchbox/v1/category/${encodeURIComponent(input.category)}`
    );
    url.searchParams.set('access_token', accessToken);
    url.searchParams.set('limit', String(input.limit));
    if (input.proximity) {
      url.searchParams.set(
        'proximity',
        `${input.proximity.longitude},${input.proximity.latitude}`
      );
    }

    return runSearch({
      httpRequest: this.httpRequest,
      getErrorMessage: (r) => this.getErrorMessage(r),
      url,
      context: {
        kind: 'category',
        category: input.category,
        proximity: input.proximity
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Shared search runner used by both tools
// ---------------------------------------------------------------------------
interface RunSearchParams {
  httpRequest: HttpRequest;
  getErrorMessage: (response: Response) => Promise<string>;
  url: URL;
  context:
    | {
        kind: 'search';
        query: string;
        proximity?: { longitude: number; latitude: number };
      }
    | {
        kind: 'category';
        category: string;
        proximity?: { longitude: number; latitude: number };
      };
}

async function runSearch(params: RunSearchParams): Promise<CallToolResult> {
  const { httpRequest, getErrorMessage, url, context } = params;

  const response = await httpRequest(url.toString());
  if (!response.ok) {
    const errorText = await getErrorMessage(response);
    return {
      content: [{ type: 'text', text: `Search API error: ${errorText}` }],
      isError: true
    };
  }

  const data = (await response.json()) as SearchResponse;
  const results = shapeResults(data.features ?? []);

  if (results.length === 0) {
    return {
      content: [{ type: 'text', text: 'No matching places found.' }],
      isError: true
    };
  }

  const summary =
    context.kind === 'search'
      ? `Found ${results.length} match${results.length === 1 ? '' : 'es'} for "${context.query}"`
      : `Found ${results.length} "${context.category}" place${results.length === 1 ? '' : 's'}`;

  const payload = {
    summary,
    kind: context.kind,
    query: context.kind === 'search' ? context.query : context.category,
    proximity: context.proximity,
    results
  };

  return {
    content: [
      { type: 'text', text: summary },
      { type: 'text', text: JSON.stringify(payload) }
    ],
    structuredContent: { search: payload },
    isError: false,
    _meta: {
      viewUUID: randomUUID()
    }
  };
}
