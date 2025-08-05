import { URLSearchParams } from 'url';
import { z } from 'zod';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';

// API documentation: https://docs.mapbox.com/api/navigation/matrix/

const MatrixInputSchema = z.object({
  coordinates: z
    .array(
      z.object({
        longitude: z
          .number()
          .min(-180, 'Longitude must be between -180 and 180 degrees')
          .max(180, 'Longitude must be between -180 and 180 degrees'),
        latitude: z
          .number()
          .min(-90, 'Latitude must be between -90 and 90 degrees')
          .max(90, 'Latitude must be between -90 and 90 degrees')
      })
    )
    .min(2, 'At least two coordinate pairs are required.')
    .max(
      25,
      'Up to 25 coordinate pairs are supported for most profiles (10 for driving-traffic).'
    )
    .describe(
      'Array of coordinate objects with longitude and latitude properties. ' +
        'Must include at least 2 coordinate pairs. ' +
        'Up to 25 coordinates total are supported for most profiles (10 for driving-traffic).'
    ),
  profile: z
    .enum(['driving-traffic', 'driving', 'walking', 'cycling'])
    .describe(
      'Routing profile for different modes of transport. Options: \n' +
        '- driving-traffic: automotive with current traffic conditions (limited to 10 coordinates)\n' +
        '- driving: automotive based on typical traffic\n' +
        '- walking: pedestrian/hiking\n' +
        '- cycling: bicycle'
    ),
  annotations: z
    .enum(['duration', 'distance', 'duration,distance', 'distance,duration'])
    .optional()
    .describe(
      'Specifies the resulting matrices. Possible values are: duration (default), distance, or both values separated by a comma.'
    ),
  approaches: z
    .string()
    .optional()
    .describe(
      'A semicolon-separated list indicating the side of the road from which to approach waypoints. ' +
        'Accepts "unrestricted" (default, route can arrive at the waypoint from either side of the road) ' +
        'or "curb" (route will arrive at the waypoint on the driving_side of the region). ' +
        'If provided, the number of approaches must be the same as the number of waypoints. ' +
        'You can skip a coordinate and show its position with the ; separator.'
    ),
  bearings: z
    .string()
    .optional()
    .describe(
      'A semicolon-separated list of headings and allowed deviation indicating the direction of movement. ' +
        'Input as two comma-separated values per location: a heading course measured clockwise from true north ' +
        'between 0 and 360, and the range of degrees by which the angle can deviate (recommended value is 45° or 90°), ' +
        'formatted as {angle,degrees}. If provided, the number of bearings must equal the number of coordinates. ' +
        'You can skip a coordinate and show its position in the list with the ; separator.'
    ),
  destinations: z
    .string()
    .optional()
    .describe(
      'Use the coordinates at given indices as destinations. ' +
        'Possible values are: a semicolon-separated list of 0-based indices, or "all" (default). ' +
        'The option "all" allows using all coordinates as destinations.'
    ),
  sources: z
    .string()
    .optional()
    .describe(
      'Use the coordinates at given indices as sources. ' +
        'Possible values are: a semicolon-separated list of 0-based indices, or "all" (default). ' +
        'The option "all" allows using all coordinates as sources.'
    )
});

export class MatrixTool extends MapboxApiBasedTool<typeof MatrixInputSchema> {
  name = 'matrix_tool';
  description =
    'Calculates travel times and distances between multiple points using Mapbox Matrix API.';

  constructor() {
    super({ inputSchema: MatrixInputSchema });
  }

  protected async execute(
    input: z.infer<typeof MatrixInputSchema>,
    accessToken: string
  ): Promise<any> {
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
    const url = `${MapboxApiBasedTool.MAPBOX_API_ENDPOINT}directions-matrix/v1/mapbox/${input.profile}/${joined}?${queryParams.toString()}`;

    // Make the request
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Request failed with status ${response.status}: ${response.statusText}`
      );
    }

    // Return the matrix data
    const data = await response.json();
    return data;
  }
}
