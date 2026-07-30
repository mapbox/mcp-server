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
  type DirectionsResponse,
  type Route
} from './DirectionsTool.output.schema.js';
import type { HttpRequest } from '../..//utils/types.js';
import { temporaryResourceManager } from '../../utils/temporaryResourceManager.js';
import { renderHint } from '../../utils/storeMapPayload.js';
import { buildSelfFetchRef } from '../../utils/selfFetchRef.js';
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

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
  }

  private formatDistance(meters: number): string {
    const km = (meters / 1000).toFixed(1);
    const miles = (meters / 1609.34).toFixed(1);
    return `${km}km (${miles}mi)`;
  }

  /** One-line label for a route option in the Stage 2 elicitation form. */
  private describeRoute(route: Route): string {
    const duration = this.formatDuration(route.duration);
    const distance = this.formatDistance(route.distance);
    const roads = route.leg_summaries?.[0] || 'Route';

    let traffic = '';
    const c = route.congestion_information;
    if (c) {
      const total =
        c.length_low + c.length_moderate + c.length_heavy + c.length_severe;
      const heavyPct =
        total > 0
          ? Math.round(((c.length_heavy + c.length_severe) / total) * 100)
          : 0;
      traffic =
        heavyPct > 20
          ? ` ⚠️ Heavy traffic (${heavyPct}%)`
          : c.length_moderate > 0
            ? ' 🟡 Moderate traffic'
            : ' ✅ Light traffic';
    }

    const incidentCount = route.incidents_summary?.length ?? 0;
    const incidents =
      incidentCount > 0 ? ` • ${incidentCount} incident(s)` : '';

    return `${duration} via ${roads} • ${distance}${traffic}${incidents}`;
  }

  /**
   * When multiple route alternatives come back, let the user pick one via
   * MCP elicitation rather than handing all of them to the model. Returns
   * the selected route's index (to thread through the self-fetch ref so the
   * map preview draws the same route) and mutates nothing — the caller
   * applies the filtered `routes` array itself.
   *
   * Mirrors search_and_geocode_tool's disambiguation elicitation: silent,
   * best-effort fallback to "return everything" on decline, on an
   * unsupported client, or on any elicitation error.
   */
  private async elicitRouteSelection(
    routes: Route[]
  ): Promise<number | undefined> {
    if (!this.server || routes.length < 2) return undefined;

    try {
      const options = routes.map((route, index) => ({
        value: String(index),
        label: this.describeRoute(route)
      }));

      const result = await this.server.server.elicitInput({
        mode: 'form',
        message: `Found ${routes.length} routes. Choose your preferred route:`,
        requestedSchema: {
          type: 'object',
          properties: {
            selectedIndex: {
              type: 'string',
              title: 'Select Route',
              description: 'Choose the route that best fits your needs',
              enum: options.map((o) => o.value),
              enumNames: options.map((o) => o.label)
            }
          },
          required: ['selectedIndex']
        }
      });

      if (result.action === 'accept' && result.content?.selectedIndex) {
        const index = parseInt(String(result.content.selectedIndex), 10);
        if (Number.isInteger(index) && index >= 0 && index < routes.length) {
          return index;
        }
      }
    } catch {
      // Elicitation isn't supported by every MCP client (Claude Desktop
      // doesn't, for example). Falling back to "return all routes" is the
      // expected behavior — silent, since Claude Desktop's UI flags tool
      // calls that emit notifications/message at any level as visually
      // failed even when the JSON-RPC response is isError: false.
    }
    return undefined;
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

    // When the API returns multiple route alternatives, let the user pick
    // one via elicitation rather than handing every option to the model.
    // selectedRouteIndex (into the *original* routes array) is threaded
    // through the self-fetch ref below so the map preview draws the same
    // route the user picked, not just whichever the API returns first.
    let selectedRouteIndex: number | undefined;
    if (validatedData.routes && validatedData.routes.length >= 2) {
      selectedRouteIndex = await this.elicitRouteSelection(
        validatedData.routes
      );
      if (selectedRouteIndex !== undefined) {
        validatedData = {
          ...validatedData,
          routes: [validatedData.routes[selectedRouteIndex]]
        };
      }
    }

    // Check response size and conditionally create temporary resource
    const RESPONSE_SIZE_THRESHOLD = 50 * 1024; // 50KB
    const responseText = JSON.stringify(validatedData, null, 2);
    const responseSize = responseText.length;

    // The map preview fetches its own route directly from the Directions
    // API (client-side, using the iframe's public token) rather than depend
    // on server-computed geometry stashed behind a ref — see
    // selfFetchRef.ts. This ref carries only the call's own input params
    // (already visible to the LLM), so unlike a mapbox://temp/ ref there's
    // nothing server-side that a restart or a rehydrated conversation could
    // invalidate. Works regardless of input.geometries since the self-fetch
    // always forces geometries=geojson itself. selectedRouteIndex (when
    // elicitation resolved to one route) tells the client which of the
    // freshly re-fetched alternatives to draw — see selectedMapboxId in
    // search_and_geocode_tool for the equivalent pattern.
    const selfFetchRef = buildSelfFetchRef('directions', {
      coordinates: input.coordinates,
      routing_profile: input.routing_profile,
      selectedRouteIndex,
      alternatives: input.alternatives,
      exclude: input.exclude,
      depart_at: input.depart_at,
      arrive_by: input.arrive_by,
      max_height: input.max_height,
      max_width: input.max_width,
      max_weight: input.max_weight
    });

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
      // Echo the self-fetch ref so the LLM can pass it to render_map_tool
      // without re-emitting any geometry itself.
      summaryStructuredContent.mapboxRender = { ref: selfFetchRef };
      const largeText = summaryText + renderHint(selfFetchRef);

      return {
        content: [{ type: 'text', text: largeText }],
        structuredContent: summaryStructuredContent,
        isError: false
      };
    }

    // Small response - return normally. structuredContent.mapboxRender
    // carries the self-fetch ref the LLM can pass to `render_map_tool` —
    // the map preview fetches its own route client-side, so nothing
    // geometry-shaped needs to be emitted here at all.
    return {
      content: [
        { type: 'text', text: responseText + renderHint(selfFetchRef) }
      ],
      structuredContent: {
        ...validatedData,
        mapboxRender: { ref: selfFetchRef }
      },
      isError: false
    };
  }
}
