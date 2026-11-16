// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { z } from 'zod';
import { URLSearchParams } from 'node:url';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { CallToolResult } from '@modelcontextprotocol/server';
import type { HttpRequest } from '../../utils/types.js';
import { MatrixInputSchema } from './MatrixTool.input.schema.js';
import {
  MatrixResponseSchema,
  type MatrixResponse
} from './MatrixTool.output.schema.js';

// API documentation: https://docs.mapbox.com/api/navigation/matrix/

export class MatrixTool extends MapboxApiBasedTool<
  typeof MatrixInputSchema,
  typeof MatrixResponseSchema
> {
  name = 'matrix_tool';
  description =
    'Calculates travel times and distances between multiple points using Mapbox Matrix API.';
  annotations = {
    title: 'Matrix Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };

  constructor(params: { httpRequest: HttpRequest }) {
    super({
      inputSchema: MatrixInputSchema,
      outputSchema: MatrixResponseSchema,
      httpRequest: params.httpRequest
    });
  }

  protected async execute(
    input: z.infer<typeof MatrixInputSchema>,
    accessToken: string
  ): Promise<CallToolResult> {
    // Validate input based on profile type
    if (
      input.profile === 'mapbox/driving-traffic' &&
      input.coordinates.length > 10
    ) {
      return {
        content: [
          {
            type: 'text',
            text: 'The driving-traffic profile supports a maximum of 10 coordinate pairs.'
          }
        ],
        isError: true
      };
    }

    // Validate approaches parameter if provided
    if (
      input.approaches &&
      input.approaches.split(';').length !== input.coordinates.length
    ) {
      return {
        content: [
          {
            type: 'text',
            text: 'When provided, the number of approaches (including empty/skipped) must match the number of coordinates.'
          }
        ],
        isError: true
      };
    }

    // Validate that all approaches values are either "curb" or "unrestricted"
    if (
      input.approaches &&
      input.approaches
        .split(';')
        .some(
          (approach) =>
            approach !== '' &&
            approach !== 'curb' &&
            approach !== 'unrestricted'
        )
    ) {
      return {
        content: [
          {
            type: 'text',
            text: 'Approaches parameter contains invalid values. Each value must be either "curb" or "unrestricted".'
          }
        ],
        isError: true
      };
    }

    // Validate bearings parameter if provided
    if (
      input.bearings &&
      input.bearings.split(';').length !== input.coordinates.length
    ) {
      return {
        content: [
          {
            type: 'text',
            text: 'When provided, the number of bearings (including empty/skipped) must match the number of coordinates.'
          }
        ],
        isError: true
      };
    }

    // Additional validation for bearings values
    if (input.bearings) {
      const bearingsArr = input.bearings.split(';');
      for (let idx = 0; idx < bearingsArr.length; idx++) {
        const bearing = bearingsArr[idx];
        if (bearing.trim() === '') continue; // allow skipped
        const parts = bearing.split(',');
        if (parts.length !== 2) {
          return {
            content: [
              {
                type: 'text',
                text: `Invalid bearings format at index ${idx}: '${bearing}'. Each bearing must be two comma-separated numbers (angle,degrees).`
              }
            ],
            isError: true
          };
        }
        const angle = Number(parts[0]);
        const degrees = Number(parts[1]);
        if (isNaN(angle) || angle < 0 || angle > 360) {
          return {
            content: [
              {
                type: 'text',
                text: `Invalid bearing angle at index ${idx}: '${parts[0]}'. Angle must be a number between 0 and 360.`
              }
            ],
            isError: true
          };
        }
        if (isNaN(degrees) || degrees < 0 || degrees > 180) {
          return {
            content: [
              {
                type: 'text',
                text: `Invalid bearing degrees at index ${idx}: '${parts[1]}'. Degrees must be a number between 0 and 180.`
              }
            ],
            isError: true
          };
        }
      }
    }

    // Validate sources parameter if provided - ensure all indices are valid
    if (
      input.sources &&
      input.sources !== 'all' &&
      input.sources.split(';').some((index) => {
        const parsedIndex = parseInt(index, 10);
        return (
          isNaN(parsedIndex) ||
          parsedIndex < 0 ||
          parsedIndex >= input.coordinates.length
        );
      })
    ) {
      return {
        content: [
          {
            type: 'text',
            text:
              'Sources parameter contains invalid indices. All indices must be between 0 and ' +
              (input.coordinates.length - 1) +
              '.'
          }
        ],
        isError: true
      };
    }

    // Validate destinations parameter if provided - ensure all indices are valid
    if (
      input.destinations &&
      input.destinations !== 'all' &&
      input.destinations.split(';').some((index) => {
        const parsedIndex = parseInt(index, 10);
        return (
          isNaN(parsedIndex) ||
          parsedIndex < 0 ||
          parsedIndex >= input.coordinates.length
        );
      })
    ) {
      return {
        content: [
          {
            type: 'text',
            text:
              'Destinations parameter contains invalid indices. All indices must be between 0 and ' +
              (input.coordinates.length - 1) +
              '.'
          }
        ],
        isError: true
      };
    }

    // The API needs at least two matrix elements (sources x destinations).
    const sourceCount =
      input.sources && input.sources !== 'all'
        ? input.sources.split(';').length
        : input.coordinates.length;
    const destinationCount =
      input.destinations && input.destinations !== 'all'
        ? input.destinations.split(';').length
        : input.coordinates.length;
    if (sourceCount * destinationCount < 2) {
      return {
        content: [
          {
            type: 'text',
            text: 'The sources and destinations must give at least two matrix elements (sources x destinations). Add another source or destination index.'
          }
        ],
        isError: true
      };
    }

    // Format coordinates for API request
    const joined = input.coordinates
      .map(({ longitude, latitude }) => `${longitude},${latitude}`)
      .join(';');

    // Build query parameters
    const queryParams = new URLSearchParams();
    queryParams.append('access_token', accessToken);

    // Add annotations parameter if specified
    if (input.annotations) {
      queryParams.append('annotations', input.annotations);
    }

    // Add approaches parameter if specified
    if (input.approaches) {
      queryParams.append('approaches', input.approaches);
    }

    // Add bearings parameter if specified
    if (input.bearings) {
      queryParams.append('bearings', input.bearings);
    }

    // Add destinations parameter if specified
    if (input.destinations) {
      queryParams.append('destinations', input.destinations);
    }

    // Add sources parameter if specified
    if (input.sources) {
      queryParams.append('sources', input.sources);
    }

    // Construct the URL for the Matrix API request
    const url = `${MapboxApiBasedTool.mapboxApiEndpoint}directions-matrix/v1/${input.profile}/${joined}?${queryParams.toString()}`;

    // Make the request
    const response = await this.httpRequest(url);

    if (!response.ok) {
      const errorMessage = await this.getErrorMessage(response);
      return {
        content: [
          {
            type: 'text',
            text: `Matrix API error: ${errorMessage}`
          }
        ],
        isError: true
      };
    }

    // Return the matrix data
    const data = await response.json();

    // Validate the response data against our schema. Never return
    // schema-violating structuredContent: the MCP SDK rejects it with an
    // output validation error.
    const parsed = MatrixResponseSchema.safeParse(data);
    if (!parsed.success) {
      this.log(
        'warning',
        `MatrixTool: Response validation failed: ${parsed.error.message}`
      );
      return {
        content: [
          {
            type: 'text',
            text: `Matrix API returned a response that didn't match the expected format: ${parsed.error.message}`
          }
        ],
        isError: true
      };
    }
    const validatedData: MatrixResponse = parsed.data;

    // A coordinate the API can't snap to the road network (in the water,
    // or with latitude and longitude swapped) comes back as a null waypoint.
    const unroutable = input.coordinates
      .map((_, idx) => idx)
      .filter(
        (idx) =>
          validatedData.sources[idx] === null ||
          validatedData.destinations[idx] === null
      );
    const note =
      unroutable.length > 0 && !input.sources && !input.destinations
        ? `\n\nNote: coordinates at index ${unroutable.join(', ')} could not be snapped to the road network, so their travel times are null. Check that they are on land and in longitude,latitude order.`
        : '';

    return {
      content: [
        { type: 'text', text: JSON.stringify(validatedData, null, 2) + note }
      ],
      structuredContent: validatedData,
      isError: false
    };
  }
}
