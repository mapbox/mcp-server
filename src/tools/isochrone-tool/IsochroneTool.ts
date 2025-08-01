import { z } from 'zod';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';

const IsochroneInputSchema = z.object({
  profile: z
    .enum([
      'mapbox/driving-traffic',
      'mapbox/driving',
      'mapbox/cycling',
      'mapbox/walking'
    ])
    .default('mapbox/driving-traffic')
    .describe('Mode of travel.'),
  coordinates: z
    .object({
      longitude: z.number().min(-180).max(180),
      latitude: z.number().min(-90).max(90)
    })
    .describe(
      'A coordinate object with longitude and latitude properties around which to center the isochrone lines. Longitude: -180 to 180, Latitude: -85.0511 to 85.0511'
    ),

  contours_minutes: z
    .array(z.number().int().min(1).max(60))
    .max(4)
    .optional()
    .describe(
      'Contour times in minutes. Times must be in increasing order. Must be specified either contours_minutes or contours_meters.'
    ),

  contours_meters: z
    .array(z.number().int().min(1).max(100000))
    .max(4)
    .optional()
    .describe(
      'Distances in meters. Distances must be in increasing order. Must be specified either contours_minutes or contours_meters.'
    ),

  contours_colors: z
    .array(z.string().regex(/^[0-9a-fA-F]{6}$/))
    .max(4)
    .optional()
    .describe(
      'Contour colors as hex strings without starting # (for example ff0000 for red. must match contours_minutes or contours_meters length if provided).'
    ),

  polygons: z
    .boolean()
    .default(false)
    .optional()
    .describe('Whether to return Polygons (true) or LineStrings (false).'),

  denoise: z
    .number()
    .min(0)
    .max(1)
    .default(1)
    .optional()
    .describe(
      'A floating point value that can be used to remove smaller contours. A value of 1.0 will only return the largest contour for a given value.'
    ),

  generalize: z
    .number()
    .min(0)
    .describe(
      `Positive number in meters that is used to simplify geometries.
        - Walking: use 0-500. Prefer 50-200 for short contours (minutes < 10 or meters < 5000), 300-500 as they grow.
        - Driving: use 1000-5000. Start at 2000, use 3000 if minutes > 10 or meters > 20000. Use 4000-5000 if near 60 minutes or 100000 meters.
      `.trim()
    ),

  exclude: z
    .array(z.enum(['motorway', 'toll', 'ferry', 'unpaved', 'cash_only_tolls']))
    .optional()
    .describe('Exclude certain road types and custom locations from routing.'),

  depart_at: z
    .string()
    .optional()
    .describe(
      'An ISO 8601 date-time string representing the time to depart (format string: YYYY-MM-DDThh:mmss±hh:mm).'
    )
});

export class IsochroneTool extends MapboxApiBasedTool<
  typeof IsochroneInputSchema
> {
  name = 'isochrone_tool';
  description = `Computes areas that are reachable within a specified amount of time from a location, and returns the reachable regions as contours of Polygons or LineStrings in GeoJSON format that you can display on a map.
  Common use cases:
    - Show a user how far they can travel in X minutes from their current location
    - Determine whether a destination is within a certain travel time threshold
    - Compare travel ranges for different modes of transportation'`;

  constructor() {
    super({ inputSchema: IsochroneInputSchema });
  }

  protected async execute(
    input: z.infer<typeof IsochroneInputSchema>,
    accessToken: string
  ): Promise<any> {
    const url = new URL(
      `${MapboxApiBasedTool.MAPBOX_API_ENDPOINT}isochrone/v1/${input.profile}/${input.coordinates.longitude}%2C${input.coordinates.latitude}`
    );
    url.searchParams.append('access_token', accessToken);
    if (
      (!input.contours_minutes || input.contours_minutes.length === 0) &&
      (!input.contours_meters || input.contours_meters.length === 0)
    ) {
      throw new Error(
        "At least one of 'contours_minutes' or 'contours_meters' must be provided"
      );
    }
    if (input.contours_minutes && input.contours_minutes.length > 0) {
      url.searchParams.append(
        'contours_minutes',
        input.contours_minutes.join(',')
      );
    }
    if (input.contours_meters && input.contours_meters.length > 0) {
      url.searchParams.append(
        'contours_meters',
        input.contours_meters?.join(',')
      );
    }
    if (input.contours_colors && input.contours_colors.length > 0) {
      url.searchParams.append(
        'contours_colors',
        input.contours_colors.join(',')
      );
    }
    if (input.polygons) {
      url.searchParams.append('polygons', String(input.polygons));
    }
    if (input.denoise) {
      url.searchParams.append('denoise', String(input.denoise));
    }
    if (input.generalize) {
      url.searchParams.append('generalize', String(input.generalize));
    }
    if (input.exclude && input.exclude.length > 0) {
      url.searchParams.append('exclude', input.exclude.join(','));
    }
    if (input.depart_at) {
      url.searchParams.append('depart_at', input.depart_at);
    }

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to calculate isochrones: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    return data;
  }
}
