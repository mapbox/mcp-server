// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';
import { coordinateSchema, profileSchema } from '../../schemas/shared.js';

export const MatrixInputSchema = z.object({
  coordinates: z
    .array(coordinateSchema)
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
  profile: profileSchema.describe(
    'Routing profile for different modes of transport. Options: \n' +
      '- mapbox/driving-traffic (default): automotive with current traffic conditions (limited to 10 coordinates)\n' +
      '- mapbox/driving: automotive based on typical traffic\n' +
      '- mapbox/walking: pedestrian/hiking\n' +
      '- mapbox/cycling: bicycle'
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
