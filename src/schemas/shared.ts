import { z } from 'zod';

export const longitudeSchema = z.number().min(-180).max(180);

export const latitudeSchema = z.number().min(-90).max(90);

/**
 * Zod schema for a coordinate object with longitude and latitude properties.
 * Longitude must be between -180 and 180. Latitude must be between -90 and 90.
 */
export const coordinateSchema = z.object({
  longitude: z
    .number()
    .min(-180, 'Longitude must be between -180 and 180 degrees')
    .max(180, 'Longitude must be between -180 and 180 degrees'),
  latitude: z
    .number()
    .min(-90, 'Latitude must be between -90 and 90 degrees')
    .max(90, 'Latitude must be between -90 and 90 degrees')
});

export const countrySchema = z
  .array(z.string().length(2))
  .describe('Array of ISO 3166 alpha 2 country codes to limit results');

export const languageSchema = z
  .string()
  .describe(
    'IETF language tag for the response (e.g., "en", "es", "fr", "de", "ja")'
  );

export const bboxSchema = z.object({
  minLongitude: z.number().min(-180).max(180),
  minLatitude: z.number().min(-90).max(90),
  maxLongitude: z.number().min(-180).max(180),
  maxLatitude: z.number().min(-90).max(90)
});
