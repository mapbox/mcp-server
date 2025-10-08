// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';
import { coordinateSchema } from '../../schemas/shared.js';

/**
 * Validates ISO 8601 date-time formats used by Mapbox Directions API
 * for both depart_at and arrive_by parameters
 */
const validateIsoDateTime = (
  val: string | undefined,
  ctx: z.RefinementCtx
): void => {
  if (!val) return; // Optional, so empty is fine

  // ISO 8601 regex patterns for the valid formats mentioned in the docs
  // 1. YYYY-MM-DDThh:mm:ssZ (exactly one Z at the end)
  // 2. YYYY-MM-DDThh:mm:ss±hh:mm (timezone offset with colon)
  // 3. YYYY-MM-DDThh:mm (no seconds, no timezone)
  // 4. YYYY-MM-DDThh:mm:ss (with seconds but no timezone) - will be converted to format 3
  const iso8601Pattern =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$)|(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$)|(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$)|(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$)/;

  if (!iso8601Pattern.test(val)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        'Invalid date-time format. Must be in ISO 8601 format: YYYY-MM-DDThh:mm:ssZ, YYYY-MM-DDThh:mmss±hh:mm, YYYY-MM-DDThh:mm, or YYYY-MM-DDThh:mm:ss',
      path: []
    });
    return; // Stop further validation if format is invalid
  }

  // Parse the date-time components to validate ranges
  try {
    // Extract date and time components
    let dateTimeComponents: string[];

    if (val.includes('Z')) {
      // Format 1: YYYY-MM-DDThh:mm:ssZ
      dateTimeComponents = val.substring(0, val.indexOf('Z')).split('T');
    } else if (val.includes('+') || val.includes('-', 10)) {
      // Check for timezone offset (skip the date's hyphens)
      // Format 2: YYYY-MM-DDThh:mmss±hh:mm
      const timezoneSeparatorIndex = Math.max(
        val.lastIndexOf('+'),
        val.lastIndexOf('-')
      );
      dateTimeComponents = val.substring(0, timezoneSeparatorIndex).split('T');
    } else {
      // Format 3: YYYY-MM-DDThh:mm
      dateTimeComponents = val.split('T');
    }

    const [datePart, timePart] = dateTimeComponents;
    const [, month, day] = datePart.split('-').map(Number);

    let hours = 0,
      minutes = 0,
      seconds = 0;
    if (timePart.includes(':')) {
      const timeParts = timePart.split(':').map(Number);
      hours = timeParts[0];
      minutes = timeParts[1];
      if (timeParts.length > 2) seconds = timeParts[2];
    }

    // Validate ranges
    if (month < 1 || month > 12) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid month: ${month}. Must be between 1 and 12.`,
        path: []
      });
    }

    // Check days in month (simplified - doesn't account for leap years)
    const daysInMonth = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (day < 1 || day > daysInMonth[month]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid day: ${day}. Must be between 1 and ${daysInMonth[month]} for month ${month}.`,
        path: []
      });
    }

    if (hours < 0 || hours > 23) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid hours: ${hours}. Must be between 0 and 23.`,
        path: []
      });
    }

    if (minutes < 0 || minutes > 59) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid minutes: ${minutes}. Must be between 0 and 59.`,
        path: []
      });
    }

    if (seconds < 0 || seconds > 59) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid seconds: ${seconds}. Must be between 0 and 59.`,
        path: []
      });
    }
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Error parsing date-time components: ${error}`,
      path: []
    });
  }
};

export const DirectionsInputSchema = z.object({
  coordinates: z
    .array(coordinateSchema)
    .min(2, 'At least two coordinate pairs are required.')
    .max(25, 'Up to 25 coordinate pairs are supported.')
    .describe(
      'Array of coordinate objects with longitude and latitude properties to visit in order. ' +
        'Must include at least 2 coordinate pairs (starting and ending points). ' +
        'Up to 25 coordinates total are supported.'
    ),
  routing_profile: z
    .enum(['driving-traffic', 'driving', 'walking', 'cycling'])
    .optional()
    .default('driving-traffic')
    .describe(
      'Routing profile for different modes of transport. Options: \n' +
        '- driving-traffic (default): automotive with current traffic conditions\n' +
        '- driving: automotive based on typical traffic\n' +
        '- walking: pedestrian/hiking\n' +
        '- cycling: bicycle'
    ),
  geometries: z
    .enum(['none', 'geojson'])
    .optional()
    .default('none')
    .describe(
      'The format of the returned geometry. Options: \n' +
        '- none (default): no geometry object is returned at all, use this if you do not need all of the intermediate coordinates.\n' +
        '- geojson: as GeoJSON LineString (might be very long as there could be a lot of points)'
    ),
  max_height: z
    .number()
    .min(0, 'Vehicle height must be between 0 and 10 meters')
    .max(10, 'Vehicle height must be between 0 and 10 meters')
    .optional()
    .describe(
      'The max vehicle height, in meters. The Directions API will compute a route that includes only roads ' +
        'with a height limit greater than or equal to the max vehicle height. ' +
        'Must be between 0 and 10 meters. The default value is 1.6 meters. ' +
        'Only available for driving and driving-traffic profiles.'
    ),
  max_width: z
    .number()
    .min(0, 'Vehicle width must be between 0 and 10 meters')
    .max(10, 'Vehicle width must be between 0 and 10 meters')
    .optional()
    .describe(
      'The max vehicle width, in meters. The Directions API will compute a route that includes only roads ' +
        'with a width limit greater than or equal to the max vehicle width. ' +
        'Must be between 0 and 10 meters. The default value is 1.9 meters. ' +
        'Only available for driving and driving-traffic profiles.'
    ),
  max_weight: z
    .number()
    .min(0, 'Vehicle weight must be between 0 and 100 metric tons')
    .max(100, 'Vehicle weight must be between 0 and 100 metric tons')
    .optional()
    .describe(
      'The max vehicle weight, in metric tons (1000 kg). The Directions API will compute a route that includes only roads ' +
        'with a weight limit greater than or equal to the max vehicle weight. ' +
        'Must be between 0 and 100 metric tons. The default value is 2.5 metric tons. ' +
        'Only available for driving and driving-traffic profiles.'
    ),
  alternatives: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Whether to try to return alternative routes (true) or not (false, default). ' +
        'Up to two alternatives may be returned.'
    ),
  depart_at: z
    .string()
    .optional()
    .superRefine(validateIsoDateTime)
    .describe(
      'The departure time in ISO 8601 format (YYYY-MM-DDThh:mm:ssZ, YYYY-MM-DDThh:mmss±hh:mm, or YYYY-MM-DDThh:mm). ' +
        'This parameter is only available for the driving and driving-traffic profiles. ' +
        'The travel time will be calculated based on historical and real-time traffic data.'
    ),
  arrive_by: z
    .string()
    .optional()
    .superRefine(validateIsoDateTime)
    .describe(
      'The desired arrival time in ISO 8601 format (YYYY-MM-DDThh:mm:ssZ, YYYY-MM-DDThh:mmss±hh:mm, or YYYY-MM-DDThh:mm). ' +
        'This parameter is only available for the driving profile and is not supported by other profiles, not even driving-traffic. ' +
        'The travel time will be calculated based on historical and real-time traffic data.'
    ),
  exclude: z
    .string()
    .optional()
    .superRefine((val, ctx) => {
      if (!val) return; // Optional, so empty is fine

      const items = val.split(',').map((item) => item.trim());

      for (const item of items) {
        // Check if it's a point exclusion
        if (item.startsWith('point(') && item.endsWith(')')) {
          const coordStr = item.substring(6, item.length - 1).trim();
          const [lngStr, latStr] = coordStr.split(' ');

          // Validate both parts exist
          if (!lngStr || !latStr) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Invalid point format in exclude parameter: '${item}'. Format should be point(<lng> <lat>)`,
              path: []
            });
            continue;
          }

          // Parse and validate longitude
          const lng = Number(lngStr);
          if (isNaN(lng) || lng < -180 || lng > 180) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Invalid longitude in exclude parameter: '${lngStr}'. Must be a number between -180 and 180`,
              path: []
            });
          }

          // Parse and validate latitude
          const lat = Number(latStr);
          if (isNaN(lat) || lat < -90 || lat > 90) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Invalid latitude in exclude parameter: '${latStr}'. Must be a number between -90 and 90`,
              path: []
            });
          }
        }
        // Check if it's one of the enum values
        else if (
          ![
            'toll',
            'cash_only_tolls',
            'motorway',
            'ferry',
            'unpaved',
            'tunnel',
            'country_border',
            'state_border'
          ].includes(item)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Invalid exclude option: '${item}'. Available options are: toll, motorway, ferry, unpaved, tunnel, country_border, state_border, or point(<lng> <lat>)`,
            path: []
          });
        }
      }
    })
    .describe(
      'Whether to exclude certain road types and custom locations from routing. ' +
        'Multiple values can be specified as a comma-separated list. ' +
        'Available options:\n' +
        '- All profiles:  ferry, cash_only_tolls\n' +
        '- Driving/Driving-traffic profiles only: motorway, toll, unpaved, tunnel, country_border, state_border or point(<lng> <lat>)\n' +
        'For custom locations you can use Point exclusions (note lng and lat are space separated and at most 50 points are allowed)\n' +
        'Note: country_border excludes all controlled country borders; borders within the Schengen Area are not excluded.'
    )
});
