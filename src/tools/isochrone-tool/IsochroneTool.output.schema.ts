// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

/**
 * Isochrone feature properties based on Mapbox Isochrone API documentation
 * https://docs.mapbox.com/api/navigation/isochrone/
 */
export const IsochroneFeaturePropertiesSchema = z.object({
  /** The value of the metric used in this contour (time in minutes or distance in meters) */
  contour: z.number().int(),
  /** The color of the isochrone line if the geometry is LineString */
  color: z.string().optional(),
  /** The opacity of the isochrone line if the geometry is LineString */
  opacity: z.number().optional(),
  /** The fill color of the isochrone polygon if the geometry is Polygon (geojson.io format) */
  fill: z.string().optional(),
  /** The fill opacity of the isochrone polygon if the geometry is Polygon (geojson.io format) */
  'fill-opacity': z.number().optional(),
  /** The fill color of the isochrone polygon if the geometry is Polygon (Leaflet format) */
  fillColor: z.string().optional(),
  /** The fill opacity of the isochrone polygon if the geometry is Polygon (Leaflet format) */
  fillOpacity: z.number().optional(),
  /** The metric that the contour represents - either "distance" or "time" */
  metric: z.enum(['distance', 'time']).optional()
});

/**
 * Isochrone geometry - can be either LineString or Polygon
 */
export const IsochroneGeometrySchema = z.union([
  z.object({
    type: z.literal('LineString'),
    coordinates: z.array(z.tuple([z.number(), z.number()])) // [longitude, latitude] pairs
  }),
  z.object({
    type: z.literal('Polygon'),
    coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))) // Array of linear rings
  })
]);

/**
 * Individual isochrone feature
 */
export const IsochroneFeatureSchema = z.object({
  type: z.literal('Feature'),
  properties: IsochroneFeaturePropertiesSchema,
  geometry: IsochroneGeometrySchema
});

/**
 * Complete Isochrone API response
 * Returns a GeoJSON FeatureCollection containing isochrone contours
 */
export const IsochroneResponseSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(IsochroneFeatureSchema)
});

export type IsochroneResponse = z.infer<typeof IsochroneResponseSchema>;
export type IsochroneFeature = z.infer<typeof IsochroneFeatureSchema>;
export type IsochroneGeometry = z.infer<typeof IsochroneGeometrySchema>;
export type IsochroneFeatureProperties = z.infer<
  typeof IsochroneFeaturePropertiesSchema
>;
