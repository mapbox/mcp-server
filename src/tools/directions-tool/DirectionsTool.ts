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
  description =
    'Fetches directions from Mapbox API based on provided coordinates and direction method.';
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
    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    }
    return `${minutes}min`;
  }

  private formatDistance(meters: number): string {
    const km = (meters / 1000).toFixed(1);
    const miles = (meters / 1609.34).toFixed(1);
    return `${km}km (${miles}mi)`;
  }

  protected async execute(
    input: z.infer<typeof DirectionsInputSchema>,
    accessToken: string
  ): Promise<CallToolResult> {
    // Stage 1: Elicit routing preferences if server available and no preferences set
    const excludeOptions: string[] = [];
    if (
      this.server &&
      !input.exclude &&
      input.coordinates.length === 2 // Only for simple A-to-B routes
    ) {
      try {
        const isDrivingProfile =
          input.routing_profile === 'mapbox/driving-traffic' ||
          input.routing_profile === 'mapbox/driving';

        const preferenceOptions = [
          {
            value: 'fastest',
            label: 'Fastest route (tolls OK)'
          },
          {
            value: 'avoid_tolls',
            label: 'Avoid tolls (may be slower)'
          }
        ];

        if (isDrivingProfile) {
          preferenceOptions.push({
            value: 'avoid_highways',
            label: 'Avoid highways/motorways'
          });
        }

        preferenceOptions.push({
          value: 'avoid_ferries',
          label: 'Avoid ferries'
        });

        const preferencesResult = await this.server.server.elicitInput({
          mode: 'form',
          message: 'Choose your routing preferences:',
          requestedSchema: {
            type: 'object',
            properties: {
              routePreference: {
                type: 'string',
                title: 'Route Preference',
                description: 'Select your routing priorities',
                enum: preferenceOptions.map((o) => o.value),
                enumNames: preferenceOptions.map((o) => o.label)
              }
            },
            required: ['routePreference']
          }
        });

        if (
          preferencesResult.action === 'accept' &&
          preferencesResult.content?.routePreference
        ) {
          const preference =
            typeof preferencesResult.content.routePreference === 'string'
              ? preferencesResult.content.routePreference
              : String(preferencesResult.content.routePreference);

          // Map preferences to exclude options
          if (preference === 'avoid_tolls') {
            excludeOptions.push('toll', 'cash_only_tolls');
          } else if (preference === 'avoid_highways' && isDrivingProfile) {
            excludeOptions.push('motorway');
          } else if (preference === 'avoid_ferries') {
            excludeOptions.push('ferry');
          }

          // Force alternatives=true to get multiple routes for Stage 2
          input.alternatives = true;

          this.log(
            'info',
            `DirectionsTool: User selected preference: ${preference}, exclude: ${excludeOptions.join(',')}`
          );
        }
      } catch (elicitError) {
        this.log(
          'warning',
          `DirectionsTool: Stage 1 elicitation failed: ${elicitError instanceof Error ? elicitError.message : 'Unknown error'}`
        );
      }
    }

    // Apply collected exclusions
    if (excludeOptions.length > 0 && !input.exclude) {
      input.exclude = excludeOptions.join(',');
    }

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
    if (input.routing_profile === 'mapbox/driving-traffic') {
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

    const url = `${MapboxApiBasedTool.mapboxApiEndpoint}directions/v5/${input.routing_profile}/${encodedCoords}?${queryString}`;

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

    // Stage 2: Elicit route selection if multiple routes returned
    if (
      this.server &&
      validatedData.routes &&
      validatedData.routes.length >= 2
    ) {
      try {
        const routeOptions = validatedData.routes.map((route, index) => {
          const duration = this.formatDuration(route.duration);
          const distance = this.formatDistance(route.distance);
          const roads =
            route.leg_summaries && route.leg_summaries.length > 0
              ? route.leg_summaries[0]
              : 'Route';

          // Build traffic/congestion summary
          let trafficInfo = '';
          if (route.congestion_information) {
            const congestion = route.congestion_information;
            const totalLength =
              congestion.length_low +
              congestion.length_moderate +
              congestion.length_heavy +
              congestion.length_severe;
            const heavyPercent = Math.round(
              ((congestion.length_heavy + congestion.length_severe) /
                totalLength) *
                100
            );
            if (heavyPercent > 20) {
              trafficInfo = ` ⚠️ Heavy traffic (${heavyPercent}%)`;
            } else if (congestion.length_moderate > 0) {
              trafficInfo = ' 🟡 Moderate traffic';
            } else {
              trafficInfo = ' ✅ Light traffic';
            }
          }

          // Count incidents
          const incidentCount = route.incidents_summary?.length || 0;
          const incidentInfo =
            incidentCount > 0 ? ` • ${incidentCount} incident(s)` : '';

          return {
            value: String(index),
            label: `${duration} via ${roads} • ${distance}${trafficInfo}${incidentInfo}`
          };
        });

        const routeSelectionResult = await this.server.server.elicitInput({
          mode: 'form',
          message: `Found ${validatedData.routes.length} routes. Choose your preferred route:`,
          requestedSchema: {
            type: 'object',
            properties: {
              selectedRoute: {
                type: 'string',
                title: 'Select Route',
                description: 'Choose the route that best fits your needs',
                enum: routeOptions.map((o) => o.value),
                enumNames: routeOptions.map((o) => o.label)
              }
            },
            required: ['selectedRoute']
          }
        });

        if (
          routeSelectionResult.action === 'accept' &&
          routeSelectionResult.content?.selectedRoute
        ) {
          const selectedIndexStr =
            typeof routeSelectionResult.content.selectedRoute === 'string'
              ? routeSelectionResult.content.selectedRoute
              : String(routeSelectionResult.content.selectedRoute);
          const selectedIndex = parseInt(selectedIndexStr, 10);
          const selectedRoute = validatedData.routes[selectedIndex];

          // Return only the selected route
          const singleRouteResult: DirectionsResponse = {
            ...validatedData,
            routes: [selectedRoute]
          };

          this.log(
            'info',
            `DirectionsTool: User selected route ${selectedIndex}: ${this.formatDuration(selectedRoute.duration)} via ${selectedRoute.leg_summaries?.[0] || 'route'}`
          );

          return {
            content: [
              { type: 'text', text: JSON.stringify(singleRouteResult, null, 2) }
            ],
            structuredContent: singleRouteResult,
            isError: false
          };
        } else if (routeSelectionResult.action === 'decline') {
          this.log(
            'info',
            'DirectionsTool: User declined to select a specific route'
          );
        }
      } catch (elicitError) {
        this.log(
          'warning',
          `DirectionsTool: Stage 2 elicitation failed: ${elicitError instanceof Error ? elicitError.message : 'Unknown error'}`
        );
      }
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(validatedData, null, 2) }],
      structuredContent: validatedData,
      isError: false
    };
  }
}
