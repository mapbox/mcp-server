// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { URLSearchParams } from 'node:url';
import type { z } from 'zod';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { cleanResponseData } from './cleanResponseData.js';
import { formatIsoDateTime } from '../../utils/dateUtils.js';
import { DirectionsInputSchema } from './DirectionsTool.input.schema.js';
import {
  DirectionsResponseSchema,
  type DirectionsResponse
} from './DirectionsTool.output.schema.js';
import type { HttpRequest } from '../..//utils/types.js';

// Docs: https://docs.mapbox.com/api/navigation/directions/

export class DirectionsTool extends MapboxApiBasedTool<
  typeof DirectionsInputSchema,
  typeof DirectionsResponseSchema
> {
  name = 'directions_tool';
  description = `Calculate optimal routes and turn-by-turn directions (navigation) between two or more locations. Returns detailed driving, walking, or cycling instructions with route geometry (path), distance, duration, and estimated travel time (ETA).

  Supports multiple routing modes:
    - Driving routes with real-time traffic (car navigation, auto routing)
    - Walking directions (pedestrian routes, on foot)
    - Cycling routes (bike paths, bicycle-friendly roads)
    - Multiple waypoints (road trip planning, multi-stop routes)

  Common use cases:
    - Get driving directions from point A to B: "How do I drive from LAX to Hollywood?"
    - Calculate travel time and distance: "How long to walk from Central Park to Times Square?"
    - Plan multi-stop routes: "Route from hotel to museum to restaurant to hotel"
    - Compare route options: "Show me the fastest route avoiding tolls"
    - Navigation with traffic: "Driving directions with current traffic conditions"

  Returns:
    - Turn-by-turn instructions
    - Route geometry (GeoJSON path for mapping)
    - Total distance and duration
    - Step-by-step maneuvers

  Related tools:
    - Use matrix_tool for travel times between many locations
    - Use isochrone_tool to see areas reachable within a time limit
    - Use search_and_geocode_tool to convert addresses to coordinates first`;
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
        input.routing_profile === 'driving-traffic' ||
        input.routing_profile === 'driving';
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
      input.routing_profile === 'driving-traffic' ||
      input.routing_profile === 'driving';

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
    if (input.arrive_by && input.routing_profile !== 'driving') {
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

    const joined = input.coordinates
      .map(({ longitude, latitude }) => `${longitude},${latitude}`)
      .join(';');
    const encodedCoords = encodeURIComponent(joined);

    // Build query parameters
    const queryParams = new URLSearchParams();
    queryParams.append('access_token', accessToken);
    // Only add geometries parameter if not 'none'
    if (input.geometries !== 'none') {
      queryParams.append('geometries', input.geometries);
    }
    queryParams.append('alternatives', input.alternatives.toString());

    // Add annotations parameter
    if (input.routing_profile === 'driving-traffic') {
      // congestion is available only when driving
      queryParams.append('annotations', 'distance,congestion,speed');
    } else {
      queryParams.append('annotations', 'distance,speed');
    }
    // For annotations to work, overview must be set to 'full'
    queryParams.append('overview', 'full');

    // Add depart_at or arrive_by parameter if provided, converting format if needed
    if (input.depart_at) {
      const formattedDateTime = formatIsoDateTime(input.depart_at);
      queryParams.append('depart_at', formattedDateTime);
    } else if (input.arrive_by) {
      const formattedDateTime = formatIsoDateTime(input.arrive_by);
      queryParams.append('arrive_by', formattedDateTime);
    }

    // Add vehicle dimension parameters if provided
    if (input.max_height !== undefined) {
      queryParams.append('max_height', input.max_height.toString());
    }

    if (input.max_width !== undefined) {
      queryParams.append('max_width', input.max_width.toString());
    }

    if (input.max_weight !== undefined) {
      queryParams.append('max_weight', input.max_weight.toString());
    }

    queryParams.append('steps', 'true');
    let queryString = queryParams.toString();

    // Add exclude parameter if provided (ensuring proper encoding of special characters)
    if (input.exclude) {
      // Custom encoding function to match the expected format in tests
      const customEncodeForExclude = (str: string) => {
        return str
          .replace(/,/g, '%2C') // Encode comma
          .replace(/\(/g, '%28') // Encode opening parenthesis
          .replace(/\)/g, '%29') // Encode closing parenthesis
          .replace(/ /g, '%20'); // Encode space as %20, not +
      };

      const excludeEncoded = customEncodeForExclude(input.exclude);
      queryString += `&exclude=${excludeEncoded}`;
    }

    const url = `${MapboxApiBasedTool.mapboxApiEndpoint}directions/v5/mapbox/${input.routing_profile}/${encodedCoords}?${queryString}`;

    const response = await this.httpRequest(url);

    if (!response.ok) {
      return {
        content: [
          {
            type: 'text',
            text: `Request failed with status ${response.status}: ${response.statusText}`
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

    return {
      content: [{ type: 'text', text: JSON.stringify(validatedData, null, 2) }],
      structuredContent: validatedData,
      isError: false
    };
  }
}
