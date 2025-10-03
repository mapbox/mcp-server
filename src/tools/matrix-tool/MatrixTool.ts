// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { z } from 'zod';
import { URLSearchParams } from 'node:url';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import { fetchClient } from '../../utils/fetchRequest.js';
import { MatrixInputSchema } from './MatrixTool.schema.js';

// API documentation: https://docs.mapbox.com/api/navigation/matrix/

export class MatrixTool extends MapboxApiBasedTool<typeof MatrixInputSchema> {
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

  private fetch: typeof globalThis.fetch;

  constructor(fetch: typeof globalThis.fetch = fetchClient) {
    super({ inputSchema: MatrixInputSchema });
    this.fetch = fetch;
  }

  protected async execute(
    input: z.infer<typeof MatrixInputSchema>,
    accessToken: string
  ): Promise<{
    content: Array<{ type: 'text'; text: string }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  }> {
    // Validate input based on profile type
    if (input.profile === 'driving-traffic' && input.coordinates.length > 10) {
      throw new Error(
        'The driving-traffic profile supports a maximum of 10 coordinate pairs.'
      );
    }

    // Validate approaches parameter if provided
    if (
      input.approaches &&
      input.approaches.split(';').length !== input.coordinates.length
    ) {
      throw new Error(
        'When provided, the number of approaches (including empty/skipped) must match the number of coordinates.'
      );
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
      throw new Error(
        'Approaches parameter contains invalid values. Each value must be either "curb" or "unrestricted".'
      );
    }

    // Validate bearings parameter if provided
    if (
      input.bearings &&
      input.bearings.split(';').length !== input.coordinates.length
    ) {
      throw new Error(
        'When provided, the number of bearings (including empty/skipped) must match the number of coordinates.'
      );
    }

    // Additional validation for bearings values
    if (input.bearings) {
      const bearingsArr = input.bearings.split(';');
      bearingsArr.forEach((bearing, idx) => {
        if (bearing.trim() === '') return; // allow skipped
        const parts = bearing.split(',');
        if (parts.length !== 2) {
          throw new Error(
            `Invalid bearings format at index ${idx}: '${bearing}'. Each bearing must be two comma-separated numbers (angle,degrees).`
          );
        }
        const angle = Number(parts[0]);
        const degrees = Number(parts[1]);
        if (isNaN(angle) || angle < 0 || angle > 360) {
          throw new Error(
            `Invalid bearing angle at index ${idx}: '${parts[0]}'. Angle must be a number between 0 and 360.`
          );
        }
        if (isNaN(degrees) || degrees < 0 || degrees > 180) {
          throw new Error(
            `Invalid bearing degrees at index ${idx}: '${parts[1]}'. Degrees must be a number between 0 and 180.`
          );
        }
      });
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
      throw new Error(
        'Sources parameter contains invalid indices. All indices must be between 0 and ' +
          (input.coordinates.length - 1) +
          '.'
      );
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
      throw new Error(
        'Destinations parameter contains invalid indices. All indices must be between 0 and ' +
          (input.coordinates.length - 1) +
          '.'
      );
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
        throw new Error(
          'When specifying both sources and destinations, all coordinates must be used as either a source or destination.'
        );
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
    const url = `${MapboxApiBasedTool.mapboxApiEndpoint}directions-matrix/v1/mapbox/${input.profile}/${joined}?${queryParams.toString()}`;

    // Make the request
    const response = await this.fetch(url);

    if (!response.ok) {
      throw new Error(
        `Request failed with status ${response.status}: ${response.statusText}`
      );
    }

    // Return the matrix data
    const data = await response.json();
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      structuredContent: data as Record<string, unknown>,
      isError: false
    };
  }
}
