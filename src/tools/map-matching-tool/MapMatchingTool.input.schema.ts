// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';
import { coordinateSchema } from '../../schemas/shared.js';

export const MapMatchingInputSchema = z.object({
  coordinates: z
    .array(coordinateSchema)
    .min(2, 'At least two coordinate pairs are required.')
    .max(100, 'Up to 100 coordinate pairs are supported.')
    .describe(
      'Array of coordinate objects with longitude and latitude properties representing a GPS trace. ' +
        'Must include at least 2 and up to 100 coordinate pairs. ' +
        'Coordinates should be in the order they were recorded.'
    ),
  profile: z
    .enum(['driving', 'driving-traffic', 'walking', 'cycling'])
    .default('driving')
    .describe(
      'Routing profile for different modes of transport. Options: \n' +
        '- driving: automotive based on road network\n' +
        '- driving-traffic: automotive with current traffic conditions\n' +
        '- walking: pedestrian/hiking\n' +
        '- cycling: bicycle'
    ),
  timestamps: z
    .array(z.number().int().positive())
    .optional()
    .describe(
      'Array of Unix timestamps (in seconds) corresponding to each coordinate. ' +
        'If provided, must have the same length as coordinates array. ' +
        'Used to improve matching accuracy based on speed.'
    ),
  radiuses: z
    .array(z.number().min(0))
    .optional()
    .describe(
      'Array of maximum distances (in meters) each coordinate can snap to the road network. ' +
        'If provided, must have the same length as coordinates array. ' +
        'Default is unlimited. Use smaller values (5-25m) for high-quality GPS, ' +
        'larger values (50-100m) for noisy GPS traces.'
    ),
  annotations: z
    .array(z.enum(['speed', 'distance', 'duration', 'congestion']))
    .optional()
    .describe(
      'Additional data to include in the response. Options: \n' +
        '- speed: Speed limit per segment (km/h)\n' +
        '- distance: Distance per segment (meters)\n' +
        '- duration: Duration per segment (seconds)\n' +
        '- congestion: Traffic level per segment (low, moderate, heavy, severe)'
    ),
  overview: z
    .enum(['full', 'simplified', 'false'])
    .default('full')
    .describe(
      'Format of the returned geometry. Options: \n' +
        '- full: Returns full geometry with all points\n' +
        '- simplified: Returns simplified geometry\n' +
        '- false: No geometry returned'
    ),
  geometries: z
    .enum(['geojson', 'polyline', 'polyline6'])
    .default('geojson')
    .describe(
      'Format of the returned geometry. Options: \n' +
        '- geojson: GeoJSON LineString (recommended)\n' +
        '- polyline: Polyline with precision 5\n' +
        '- polyline6: Polyline with precision 6'
    )
});

export type MapMatchingInput = z.infer<typeof MapMatchingInputSchema>;
