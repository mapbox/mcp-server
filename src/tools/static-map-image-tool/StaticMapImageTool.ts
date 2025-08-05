import { z } from 'zod';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';

// List of valid Maki icon names
const MAKI_ICONS = [
  'aerialway',
  'airfield',
  'airport',
  'alcohol-shop',
  'american-football',
  'amusement-park',
  'animal-shelter',
  'aquarium',
  'arrow',
  'art-gallery',
  'attraction',
  'bakery',
  'bank-JP',
  'bank',
  'bar',
  'barrier',
  'baseball',
  'basketball',
  'bbq',
  'beach',
  'beer',
  'bicycle-share',
  'bicycle',
  'blood-bank',
  'bowling-alley',
  'bridge',
  'building-alt1',
  'building',
  'bus',
  'cafe',
  'campsite',
  'car-rental',
  'car-repair',
  'car',
  'casino',
  'castle-JP',
  'castle',
  'caution',
  'cemetery-JP',
  'cemetery',
  'charging-station',
  'cinema',
  'circle-stroked',
  'circle',
  'city',
  'clothing-store',
  'college-JP',
  'college',
  'commercial',
  'communications-tower',
  'confectionery',
  'construction',
  'convenience',
  'cricket',
  'cross',
  'dam',
  'danger',
  'defibrillator',
  'dentist',
  'diamond',
  'doctor',
  'dog-park',
  'drinking-water',
  'elevator',
  'embassy',
  'emergency-phone',
  'entrance-alt1',
  'entrance',
  'farm',
  'fast-food',
  'fence',
  'ferry-JP',
  'ferry',
  'fire-station-JP',
  'fire-station',
  'fitness-centre',
  'florist',
  'fuel',
  'furniture',
  'gaming',
  'garden-centre',
  'garden',
  'gate',
  'gift',
  'globe',
  'golf',
  'grocery',
  'hairdresser',
  'harbor',
  'hardware',
  'heart',
  'heliport',
  'highway-rest-area',
  'historic',
  'home',
  'horse-riding',
  'hospital-JP',
  'hospital',
  'hot-spring',
  'ice-cream',
  'industry',
  'information',
  'jewelry-store',
  'karaoke',
  'landmark-JP',
  'landmark',
  'landuse',
  'laundry',
  'library',
  'lift-gate',
  'lighthouse-JP',
  'lighthouse',
  'lodging',
  'logging',
  'marae',
  'marker-stroked',
  'marker',
  'mobile-phone',
  'monument-JP',
  'monument',
  'mountain',
  'museum',
  'music',
  'natural',
  'nightclub',
  'observation-tower',
  'optician',
  'paint',
  'park-alt1',
  'park',
  'parking-garage',
  'parking-paid',
  'parking',
  'pharmacy',
  'picnic-site',
  'pitch',
  'place-of-worship',
  'playground',
  'police-JP',
  'police',
  'post-JP',
  'post',
  'prison',
  'racetrack-boat',
  'racetrack-cycling',
  'racetrack-horse',
  'racetrack',
  'rail-light',
  'rail-metro',
  'rail',
  'ranger-station',
  'recycling',
  'religious-buddhist',
  'religious-christian',
  'religious-jewish',
  'religious-muslim',
  'religious-shinto',
  'residential-community',
  'restaurant-bbq',
  'restaurant-noodle',
  'restaurant-pizza',
  'restaurant-seafood',
  'restaurant-sushi',
  'restaurant',
  'road-accident',
  'roadblock',
  'rocket',
  'school-JP',
  'school',
  'scooter',
  'shelter',
  'shoe',
  'shop',
  'skateboard',
  'skiing',
  'slaughterhouse',
  'slipway',
  'snowmobile',
  'soccer',
  'square-stroked',
  'square',
  'stadium',
  'star-stroked',
  'star',
  'suitcase',
  'swimming',
  'table-tennis',
  'taxi',
  'teahouse',
  'telephone',
  'tennis',
  'terminal',
  'theatre',
  'toilet',
  'toll',
  'town-hall',
  'town',
  'triangle-stroked',
  'triangle',
  'tunnel',
  'veterinary',
  'viewpoint',
  'village',
  'volcano',
  'volleyball',
  'warehouse',
  'waste-basket',
  'watch',
  'water',
  'waterfall',
  'watermill',
  'wetland',
  'wheelchair',
  'windmill',
  'zoo'
];

// Overlay schemas
const MarkerOverlaySchema = z.object({
  type: z.literal('marker'),
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-85.0511).max(85.0511),
  size: z.enum(['small', 'large']).optional().default('small'),
  label: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return val;

      const lowerVal = val.toLowerCase();

      // Check if it's a single letter, number 0-99, or valid Maki icon
      if (
        /^[a-z]$/.test(lowerVal) ||
        /^[0-9]{1,2}$/.test(val) ||
        MAKI_ICONS.includes(lowerVal)
      ) {
        return lowerVal;
      }

      // If more than one character and not a valid Maki icon, truncate to first character
      return lowerVal.charAt(0);
    })
    .describe(
      `Single letter (a-z), number (0-99), or Maki icon name. Valid Maki icons: ${MAKI_ICONS.join(', ')}. Labels longer than one character that are not valid Maki icons will be truncated to the first character.`
    ),
  color: z
    .string()
    .regex(/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/)
    .optional()
    .describe('3 or 6 digit hex color without #')
});

const CustomMarkerOverlaySchema = z.object({
  type: z.literal('custom-marker'),
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-85.0511).max(85.0511),
  url: z
    .string()
    .url()
    .describe('URL of custom marker image (PNG or JPEG, max 1024px)')
});

const PathOverlaySchema = z.object({
  type: z.literal('path'),
  encodedPolyline: z
    .string()
    .min(1)
    .describe('Encoded polyline string with 5 decimal place precision'),
  strokeWidth: z.number().min(1).optional().default(5),
  strokeColor: z
    .string()
    .regex(/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/)
    .optional()
    .describe('3 or 6 digit hex color without #'),
  strokeOpacity: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Stroke opacity (0-1)'),
  fillColor: z
    .string()
    .regex(/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/)
    .optional()
    .describe('3 or 6 digit hex color without #'),
  fillOpacity: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Fill opacity (0-1)')
});

const GeoJsonOverlaySchema = z.object({
  type: z.literal('geojson'),
  data: z
    .any()
    .describe('GeoJSON object (Point, MultiPoint, LineString, or Polygon)')
});

const OverlaySchema = z.discriminatedUnion('type', [
  MarkerOverlaySchema,
  CustomMarkerOverlaySchema,
  PathOverlaySchema,
  GeoJsonOverlaySchema
]);

const StaticMapImageInputSchema = z.object({
  center: z
    .object({
      longitude: z.number().min(-180).max(180),
      latitude: z.number().min(-85.0511).max(85.0511)
    })
    .describe(
      'Center point of the map as coordinate object with longitude and latitude properties. Longitude: -180 to 180, Latitude: -85.0511 to 85.0511'
    ),
  zoom: z
    .number()
    .min(0)
    .max(22)
    .describe(
      'Zoom level (0-22). Fractional zoom levels are rounded to two decimal places'
    ),
  size: z
    .object({
      width: z.number().min(1).max(1280),
      height: z.number().min(1).max(1280)
    })
    .describe(
      'Image size as object with width and height properties in pixels. Each dimension must be between 1 and 1280 pixels'
    ),
  style: z
    .string()
    .optional()
    .default('mapbox/streets-v12')
    .describe(
      'Mapbox style ID (e.g., mapbox/streets-v12, mapbox/satellite-v9, mapbox/dark-v11)'
    ),
  highDensity: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether to return a high-density (2x) image'),
  overlays: z
    .array(OverlaySchema)
    .optional()
    .describe(
      'Array of overlays to add to the map. Overlays are rendered in order (last item appears on top)'
    )
});

export class StaticMapImageTool extends MapboxApiBasedTool<
  typeof StaticMapImageInputSchema
> {
  name = 'static_map_image_tool';
  description =
    'Generates a static map image from Mapbox Static Images API. Supports center coordinates, zoom level (0-22), image size (up to 1280x1280), various Mapbox styles, and overlays (markers, paths, GeoJSON). Returns PNG for vector styles, JPEG for raster-only styles.';

  constructor() {
    super({ inputSchema: StaticMapImageInputSchema });
  }

  private encodeOverlay(overlay: z.infer<typeof OverlaySchema>): string {
    switch (overlay.type) {
      case 'marker': {
        const size = overlay.size === 'large' ? 'pin-l' : 'pin-s';
        let marker = size;

        if (overlay.label) {
          marker += `-${overlay.label}`;
        }

        if (overlay.color) {
          marker += `+${overlay.color}`;
        }

        return `${marker}(${overlay.longitude},${overlay.latitude})`;
      }

      case 'custom-marker': {
        const encodedUrl = encodeURIComponent(overlay.url);
        return `url-${encodedUrl}(${overlay.longitude},${overlay.latitude})`;
      }

      case 'path': {
        let path = `path-${overlay.strokeWidth}`;

        if (overlay.strokeColor) {
          path += `+${overlay.strokeColor}`;
          if (overlay.strokeOpacity !== undefined) {
            path += `-${overlay.strokeOpacity}`;
          }
        }

        if (overlay.fillColor) {
          path += `+${overlay.fillColor}`;
          if (overlay.fillOpacity !== undefined) {
            path += `-${overlay.fillOpacity}`;
          }
        }

        // URL encode the polyline to handle special characters
        return `${path}(${encodeURIComponent(overlay.encodedPolyline)})`;
      }

      case 'geojson': {
        const geojsonString = JSON.stringify(overlay.data);
        return `geojson(${encodeURIComponent(geojsonString)})`;
      }
    }
  }

  protected async execute(
    input: z.infer<typeof StaticMapImageInputSchema>,
    accessToken: string
  ): Promise<any> {
    const { longitude: lng, latitude: lat } = input.center;
    const { width, height } = input.size;

    // Build overlay string
    let overlayString = '';
    if (input.overlays && input.overlays.length > 0) {
      const encodedOverlays = input.overlays.map((overlay) => {
        return this.encodeOverlay(overlay as any);
      });
      overlayString = encodedOverlays.join(',') + '/';
    }

    const density = input.highDensity ? '@2x' : '';
    const url = `${MapboxApiBasedTool.MAPBOX_API_ENDPOINT}styles/v1/${input.style}/static/${overlayString}${lng},${lat},${input.zoom}/${width}x${height}${density}?access_token=${accessToken}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch map image: ${response.status} ${response.statusText}`
      );
    }

    const buffer = await response.arrayBuffer();

    const base64Data = Buffer.from(buffer).toString('base64');

    // Determine MIME type based on style (raster-only styles return JPEG)
    const isRasterStyle = input.style.includes('satellite');
    const mimeType = isRasterStyle ? 'image/jpeg' : 'image/png';

    return {
      type: 'image',
      data: base64Data,
      mimeType
    };
  }
}
