// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { randomBytes, randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { createUIResource } from '@mcp-ui/server';
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
import { getUserNameFromToken } from '../../utils/jwtUtils.js';
import { isMcpUiEnabled } from '../../config/toolConfig.js';
import { resolveMapboxPublicToken } from '../../utils/mapboxPublicToken.js';
import { renderDirectionsAppHtml } from '../../resources/ui-apps/directionsAppHtml.js';

// Docs: https://docs.mapbox.com/api/navigation/directions/

export class DirectionsTool extends MapboxApiBasedTool<
  typeof DirectionsInputSchema,
  typeof DirectionsResponseSchema
> {
  name = 'directions_tool';
  description =
    'Fetches directions from Mapbox API based on provided coordinates and direction method. ' +
    'This tool always attaches an interactive map preview UI to its result; the map fetches and ' +
    'renders its own route independently, so it works regardless of the geometries parameter. ' +
    'Use geometries="none" (default) for compact text/data responses (distance, duration, ' +
    'turn-by-turn instructions). Use geometries="geojson" only when you need the raw route ' +
    'coordinates in the response yourself.';
  annotations = {
    title: 'Directions Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };
  readonly meta = {
    ui: {
      resourceUri: 'ui://mapbox/directions-app/index.html',
      csp: {
        connectDomains: ['https://*.mapbox.com', 'https://events.mapbox.com'],
        resourceDomains: ['https://api.mapbox.com']
      }
    }
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

    let uiResourceBlock: CallToolResult['content'][number] | undefined;
    if (isMcpUiEnabled()) {
      const inlineHtml = await tryRenderInlineUiHtml(
        input,
        accessToken,
        this.httpRequest
      );
      if (inlineHtml) {
        uiResourceBlock = createUIResource({
          uri: `ui://mapbox/directions/${randomUUID()}`,
          content: { type: 'rawHtml', htmlString: inlineHtml },
          encoding: 'text',
          uiMetadata: {
            'preferred-frame-size': ['100%', '500px']
          }
        });
      }
    }

    // Check response size and conditionally create temporary resource
    const RESPONSE_SIZE_THRESHOLD = 50 * 1024; // 50KB
    const responseText = JSON.stringify(validatedData, null, 2);
    const responseSize = responseText.length;

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
      const summaryStructuredContent = {
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

      const content: CallToolResult['content'] = [
        { type: 'text', text: summaryText }
      ];
      if (uiResourceBlock) content.push(uiResourceBlock);

      return {
        content,
        structuredContent: summaryStructuredContent,
        isError: false
      };
    }

    // Small response - return normally
    const content: CallToolResult['content'] = [
      { type: 'text', text: responseText }
    ];
    if (uiResourceBlock) content.push(uiResourceBlock);

    return {
      content,
      structuredContent: validatedData,
      isError: false
    };
  }
}

/**
 * Render the same DirectionsAppHtml as the MCP Apps resource, but with the
 * call's input parameters baked in so the iframe can self-fetch the route
 * from the Directions API — MCP-UI clients don't fetch external resources,
 * so this is what makes the map work for them too. Attached unconditionally;
 * the only failure mode is no public token being resolvable, in which case
 * the caller falls back to text-only output.
 */
async function tryRenderInlineUiHtml(
  input: z.infer<typeof DirectionsInputSchema>,
  accessToken: string,
  httpRequest: HttpRequest
): Promise<string | undefined> {
  const publicToken = await resolveMapboxPublicToken({
    accessToken,
    apiEndpoint: MapboxApiBasedTool.mapboxApiEndpoint,
    httpRequest
  });
  if (!publicToken) return undefined;

  return renderDirectionsAppHtml({
    publicToken,
    apiEndpoint: MapboxApiBasedTool.mapboxApiEndpoint,
    initialData: {
      params: {
        coordinates: input.coordinates,
        routing_profile: input.routing_profile,
        alternatives: input.alternatives,
        exclude: input.exclude,
        depart_at: input.depart_at,
        arrive_by: input.arrive_by,
        max_height: input.max_height,
        max_width: input.max_width,
        max_weight: input.max_weight
      }
    }
  });
}
