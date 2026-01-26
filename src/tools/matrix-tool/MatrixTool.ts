// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { z } from 'zod';
import { URLSearchParams } from 'node:url';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
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

    // Validate that when specifying both sources and destinations, all coordinates are used
    if (
      input.sources &&
      input.sources !== 'all' &&
      input.destinations &&
      input.destinations !== 'all'
    ) {
      // Get all unique coordinate indices that are used
      const sourcesIndices = input.sources
        .split(';')
        .map((idx) => parseInt(idx, 10));
      const destinationsIndices = input.destinations
        .split(';')
        .map((idx) => parseInt(idx, 10));
      const usedIndices = new Set([...sourcesIndices, ...destinationsIndices]);

      // Check if all coordinate indices are used
      if (usedIndices.size < input.coordinates.length) {
        return {
          content: [
            {
              type: 'text',
              text: 'When specifying both sources and destinations, all coordinates must be used as either a source or destination.'
            }
          ],
          isError: true
        };
      }
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

    // Validate the response data against our schema
    let validatedData: MatrixResponse;
    try {
      validatedData = MatrixResponseSchema.parse(data);
    } catch (error) {
      // If validation fails, fall back to the original data
      this.log('warning', `MatrixTool: Response validation failed: ${error}`);
      validatedData = data as MatrixResponse;
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(validatedData, null, 2) }],
      structuredContent: validatedData,
      isError: false
    };
  }
}
