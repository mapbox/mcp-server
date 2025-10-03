// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { URLSearchParams } from 'node:url';
import type { z } from 'zod';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import { cleanResponseData } from './cleanResponseData.js';
import { formatIsoDateTime } from '../../utils/dateUtils.js';
import { fetchClient } from '../../utils/fetchRequest.js';
import { DirectionsInputSchema } from './DirectionsTool.schema.js';

// Docs: https://docs.mapbox.com/api/navigation/directions/

export class DirectionsTool extends MapboxApiBasedTool<
  typeof DirectionsInputSchema
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

  constructor(private fetch: typeof globalThis.fetch = fetchClient) {
    super({ inputSchema: DirectionsInputSchema });
  }
  protected async execute(
    input: z.infer<typeof DirectionsInputSchema>,
    accessToken: string
  ): Promise<unknown> {
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
          throw new Error(
            `Point exclusions (${item}) are only available for 'driving' and 'driving-traffic' profiles`
          );
        }
        // Check for driving-only exclusions
        else if (drivingOnlyExclusions.includes(item) && !isDrivingProfile) {
          throw new Error(
            `Exclusion option '${item}' is only available for 'driving' and 'driving-traffic' profiles`
          );
        }
        // Check if it's one of the valid enum values
        else if (
          !commonExclusions.includes(item) &&
          !drivingOnlyExclusions.includes(item) &&
          !(item.startsWith('point(') && item.endsWith(')'))
        ) {
          throw new Error(
            `Invalid exclude option: '${item}'.Available options:\n` +
              '- All profiles:  ferry, cash_only_tolls\n' +
              '- Driving/Driving-traffic profiles only: `motorway`, `toll`, `unpaved`, `tunnel`, `country_border`, `state_border` or `point(<lng> <lat>)` for custom locations (note lng and lat are space separated)\n'
          );
        }
      }
    }

    const isDrivingProfile =
      input.routing_profile === 'driving-traffic' ||
      input.routing_profile === 'driving';

    // Validate depart_at is only used with driving profiles
    if (input.depart_at && !isDrivingProfile) {
      throw new Error(
        `The depart_at parameter is only available for 'driving' and 'driving-traffic' profiles`
      );
    }

    // Validate arrive_by is only used with driving profile (not driving-traffic)
    if (input.arrive_by && input.routing_profile !== 'driving') {
      throw new Error(
        `The arrive_by parameter is only available for the 'driving' profile`
      );
    }

    // Validate that depart_at and arrive_by are not used together
    if (input.depart_at && input.arrive_by) {
      throw new Error(
        `The depart_at and arrive_by parameters cannot be used together in the same request`
      );
    }

    // Validate vehicle dimension parameters are only used with driving profiles
    if (
      (input.max_height !== undefined ||
        input.max_width !== undefined ||
        input.max_weight !== undefined) &&
      !isDrivingProfile
    ) {
      throw new Error(
        `Vehicle dimension parameters (max_height, max_width, max_weight) are only available for 'driving' and 'driving-traffic' profiles`
      );
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

    const response = await this.fetch(url);

    if (!response.ok) {
      throw new Error(
        `Request failed with status ${response.status}: ${response.statusText}`
      );
    }

    const data = await response.json();
    return cleanResponseData(input, data);
  }
}
