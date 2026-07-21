// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { randomBytes } from 'node:crypto';
import type { z } from 'zod';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { cleanResponseData } from './cleanResponseData.js';
import { buildDirectionsRequestUrl } from './buildDirectionsRequestUrl.js';
import { DirectionsInputSchema } from './DirectionsTool.input.schema.js';
import {
  DirectionsResponseSchema,
  type DirectionsResponse
} from './DirectionsTool.output.schema.js';
import type { HttpRequest } from '../..//utils/types.js';
import { temporaryResourceManager } from '../../utils/temporaryResourceManager.js';
import {
  decodePolylineWithFallback,
  type MapAppPayload
} from '../../utils/mapAppPayload.js';
import { storeMapPayload, renderHint } from '../../utils/storeMapPayload.js';
import { getUserNameFromToken } from '../../utils/jwtUtils.js';

// Docs: https://docs.mapbox.com/api/navigation/directions/

export class DirectionsTool extends MapboxApiBasedTool<
  typeof DirectionsInputSchema,
  typeof DirectionsResponseSchema
> {
  name = 'directions_tool';
  description =
    'Fetches directions from Mapbox API based on provided coordinates and direction method. ' +
    'Returns a `mapboxRender.ref` in structuredContent regardless of the geometries value - pass ' +
    'it to render_map_tool to display the route on a live Mapbox GL JS map. ' +
    'Use geometries="none" (default) for compact text/data responses (distance, duration, ' +
    'turn-by-turn instructions). Use geometries="geojson" only when you need the raw route ' +
    'coordinates in the response yourself - the map preview works either way.';
  annotations = {
    title: 'Directions Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };
  constructor(params: { httpRequest: HttpRequest }) {
    super({
      inputSchema: DirectionsInputSchema,
      outputSchema: DirectionsResponseSchema,
      httpRequest: params.httpRequest
    });
  }
  protected async execute(
    input: z.infer<typeof DirectionsInputSchema>,
    accessToken: string
  ): Promise<CallToolResult> {
    // Validate exclude parameter against the actual routing_profile
    // This is needed because some exclusions are only driving specific
    if (input.exclude) {
      const commonExclusions = ['ferry', 'cash_only_tolls'];
      const drivingOnlyExclusions = [
        'toll',
        'motorway',
        'unpaved',
        'tunnel',
        'country_border',
        'state_border'
      ];

      const isDrivingProfile =
        input.routing_profile === 'mapbox/driving-traffic' ||
        input.routing_profile === 'mapbox/driving';
      const items = input.exclude.split(',').map((item) => item.trim());

      for (const item of items) {
        // Check for point exclusions
        if (
          item.startsWith('point(') &&
          item.endsWith(')') &&
          !isDrivingProfile
        ) {
          return {
            content: [
              {
                type: 'text',
                text: `Point exclusions (${item}) are only available for 'driving' and 'driving-traffic' profiles`
              }
            ],
            isError: true
          };
        }
        // Check for driving-only exclusions
        else if (drivingOnlyExclusions.includes(item) && !isDrivingProfile) {
          return {
            content: [
              {
                type: 'text',
                text: `Exclusion option '${item}' is only available for 'driving' and 'driving-traffic' profiles`
              }
            ],
            isError: true
          };
        }
        // Check if it's one of the valid enum values
        else if (
          !commonExclusions.includes(item) &&
          !drivingOnlyExclusions.includes(item) &&
          !(item.startsWith('point(') && item.endsWith(')'))
        ) {
          return {
            content: [
              {
                type: 'text',
                text:
                  `Invalid exclude option: '${item}'.Available options:\\n` +
                  '- All profiles:  ferry, cash_only_tolls\\n' +
                  '- Driving/Driving-traffic profiles only: `motorway`, `toll`, `unpaved`, `tunnel`, `country_border`, `state_border` or `point(<lng> <lat>)` for custom locations (note lng and lat are space separated)\\n'
              }
            ],
            isError: true
          };
        }
      }
    }

    const isDrivingProfile =
      input.routing_profile === 'mapbox/driving-traffic' ||
      input.routing_profile === 'mapbox/driving';

    // Validate depart_at is only used with driving profiles
    if (input.depart_at && !isDrivingProfile) {
      return {
        content: [
          {
            type: 'text',
            text: `The depart_at parameter is only available for 'driving' and 'driving-traffic' profiles`
          }
        ],
        isError: true
      };
    }

    // Validate arrive_by is only used with driving profile (not driving-traffic)
    if (input.arrive_by && input.routing_profile !== 'mapbox/driving') {
      return {
        content: [
          {
            type: 'text',
            text: `The arrive_by parameter is only available for the 'driving' profile`
          }
        ],
        isError: true
      };
    }

    // Validate that depart_at and arrive_by are not used together
    if (input.depart_at && input.arrive_by) {
      return {
        content: [
          {
            type: 'text',
            text: `The depart_at and arrive_by parameters cannot be used together in the same request`
          }
        ],
        isError: true
      };
    }

    // Validate vehicle dimension parameters are only used with driving profiles
    if (
      (input.max_height !== undefined ||
        input.max_width !== undefined ||
        input.max_weight !== undefined) &&
      !isDrivingProfile
    ) {
      return {
        content: [
          {
            type: 'text',
            text: `Vehicle dimension parameters (max_height, max_width, max_weight) are only available for 'driving' and 'driving-traffic' profiles`
          }
        ],
        isError: true
      };
    }

    const url = buildDirectionsRequestUrl({
      input,
      accessToken,
      apiEndpoint: MapboxApiBasedTool.mapboxApiEndpoint
    });

    const response = await this.httpRequest(url);

    if (!response.ok) {
      const errorMessage = await this.getErrorMessage(response);
      return {
        content: [
          {
            type: 'text',
            text: `Directions API error: ${errorMessage}`
          }
        ],
        isError: true
      };
    }

    const data = (await response.json()) as DirectionsResponse;
    const cleanedData = cleanResponseData(input, data);

    // Validate the response data against our schema
    let validatedData: DirectionsResponse;
    try {
      validatedData = DirectionsResponseSchema.parse(cleanedData);
    } catch (error) {
      // If validation fails, fall back to the original data
      this.log(
        'warning',
        `DirectionsTool: Response validation failed: ${error}`
      );
      validatedData = cleanedData as DirectionsResponse;
    }

    // Check response size and conditionally create temporary resource
    const RESPONSE_SIZE_THRESHOLD = 50 * 1024; // 50KB
    const responseText = JSON.stringify(validatedData, null, 2);
    const responseSize = responseText.length;

    // Build the map-app payload from the full geometry before we conditionally
    // strip it for the large-response path — the iframe needs the route line.
    // The tool's own response may have geometries="none" (the default, to
    // keep route coordinates out of the model's context) - when so, fetch a
    // second, map-only response with geometry forced on, so the map preview
    // never depends on what the caller itself requested.
    const mapPayloadFull = buildDirectionsMapPayload(
      input.geometries === 'geojson'
        ? validatedData
        : await fetchDirectionsGeometryForMap(
            input,
            accessToken,
            this.httpRequest
          )
    );

    if (responseSize > RESPONSE_SIZE_THRESHOLD) {
      // Create temporary resource for large response
      const resourceId = randomBytes(16).toString('hex');
      const resourceUri = `mapbox://temp/directions-${resourceId}`;

      temporaryResourceManager.create({
        id: resourceId,
        uri: resourceUri,
        data: validatedData,
        metadata: { toolName: this.name, size: responseSize },
        owner: getUserNameFromToken(accessToken)
      });

      // Extract summary information
      const route = validatedData.routes?.[0];
      const distance = route?.distance
        ? `${(route.distance / 1609.34).toFixed(1)} miles`
        : 'unknown';
      const duration = route?.duration
        ? `${Math.floor(route.duration / 60)} minutes`
        : 'unknown';
      const waypointCount = validatedData.waypoints?.length ?? 0;

      const summaryText = `Route found: ${distance}, ${duration}

Waypoints: ${waypointCount}
${responseSize > RESPONSE_SIZE_THRESHOLD ? `\n⚠️ Full response (${Math.round(responseSize / 1024)}KB) exceeds context limit.\n\nFull geometry and details stored as temporary resource.\nResource URI: ${resourceUri}\nTTL: 30 minutes\n\nUse the MCP resource API to retrieve full details if needed.\nOr ask to read the resource by its URI.` : ''}`;

      // Create minimal structured content for validation (without large geometry)
      const summaryStructuredContent: Record<string, unknown> = {
        ...validatedData,
        routes: validatedData.routes?.map((route) => ({
          distance: route.distance,
          duration: route.duration,
          duration_typical: route.duration_typical,
          weight_typical: route.weight_typical,
          leg_summaries: route.leg_summaries,
          intersecting_admins: route.intersecting_admins,
          notifications_summary: route.notifications_summary,
          incidents_summary: route.incidents_summary,
          num_legs: route.num_legs,
          congestion_information: route.congestion_information,
          average_speed_kph: route.average_speed_kph,
          // Omit geometry and legs to keep response small
          geometry: undefined,
          legs: undefined
        }))
      };
      // Stash the map payload server-side and only return a short ref so
      // the LLM doesn't have to re-emit thousands of coordinate pairs as
      // input to render_map_tool. Echo the ref in the visible text so the
      // LLM doesn't hallucinate the URI.
      let largeText = summaryText;
      if (mapPayloadFull) {
        const ref = storeMapPayload(
          mapPayloadFull,
          getUserNameFromToken(accessToken)
        );
        summaryStructuredContent.mapboxRender = { ref };
        largeText += renderHint(ref);
      }

      return {
        content: [{ type: 'text', text: largeText }],
        structuredContent: summaryStructuredContent,
        isError: false
      };
    }

    // Small response - return normally. The map payload is stored
    // server-side; structuredContent.mapboxRender carries a short ref the LLM
    // can pass to `render_map_tool` to display the route on a live Mapbox
    // GL JS map (avoids re-emitting the full polyline through the model).
    const mapPayload = mapPayloadFull;
    const smallRef = mapPayload
      ? storeMapPayload(mapPayload, getUserNameFromToken(accessToken))
      : null;
    return {
      content: [
        {
          type: 'text',
          text: responseText + (smallRef ? renderHint(smallRef) : '')
        }
      ],
      structuredContent: smallRef
        ? { ...validatedData, mapboxRender: { ref: smallRef } }
        : validatedData,
      isError: false
    };
  }
}

/**
 * Fetch a map-only Directions response with geometry forced on, for callers
 * whose own `input.geometries` isn't already `'geojson'` — so the map
 * preview never depends on what geometry format the caller itself
 * requested. Returns null on any fetch/parse failure (the map payload
 * builder treats that the same as "no route to draw").
 */
async function fetchDirectionsGeometryForMap(
  input: z.infer<typeof DirectionsInputSchema>,
  accessToken: string,
  httpRequest: HttpRequest
): Promise<DirectionsResponse | null> {
  const url = buildDirectionsRequestUrl({
    input,
    accessToken,
    apiEndpoint: MapboxApiBasedTool.mapboxApiEndpoint,
    geometriesOverride: 'geojson'
  });
  const response = await httpRequest(url);
  if (!response.ok) return null;
  try {
    return (await response.json()) as DirectionsResponse;
  } catch {
    return null;
  }
}

/**
 * Build a generic `MapAppPayload` from a Directions API response:
 *   - one `line` layer for the route
 *   - start/end markers (badge style)
 *   - summary chip with miles + minutes
 *
 * Returns null when the response has no renderable geometry (e.g. the
 * polyline failed to decode) or no response was provided at all.
 */
function buildDirectionsMapPayload(
  data: DirectionsResponse | null
): MapAppPayload | null {
  const route = data?.routes?.[0];
  if (!route) return null;

  // Normalize geometry to GeoJSON LineString — handles both
  // geometries=geojson (object) and geometries=polyline/polyline6 (string).
  let coords: [number, number][] | null = null;
  const g = route.geometry as unknown;
  if (
    g &&
    typeof g === 'object' &&
    (g as { type?: string }).type === 'LineString' &&
    Array.isArray((g as { coordinates?: unknown }).coordinates)
  ) {
    coords = (g as { coordinates: [number, number][] }).coordinates;
  } else if (typeof g === 'string' && g.length > 0) {
    coords = decodePolylineWithFallback(g);
  }
  if (!coords || coords.length === 0) return null;

  const summaryParts: string[] = [];
  if (typeof route.distance === 'number') {
    summaryParts.push(`${(route.distance / 1609.34).toFixed(1)} mi`);
  }
  if (typeof route.duration === 'number') {
    summaryParts.push(`${Math.round(route.duration / 60)} min`);
  }
  const summary = summaryParts.length
    ? `Route: ${summaryParts.join(', ')}`
    : 'Route';

  return {
    summary,
    layers: [
      {
        id: 'route',
        type: 'line',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: {}
        },
        paint: { 'line-color': '#3b82f6', 'line-width': 5 },
        layout: { 'line-join': 'round', 'line-cap': 'round' }
      }
    ],
    markers: [
      { coordinates: coords[0], style: 'start', popup: 'Start' },
      {
        coordinates: coords[coords.length - 1],
        style: 'end',
        popup: 'End'
      }
    ]
  };
}
