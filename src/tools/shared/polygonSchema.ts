// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

export const CoordinateSchema = z
  .array(z.number())
  .length(2)
  .describe('Coordinate as [longitude, latitude]');

const RingSchema = z
  .array(CoordinateSchema)
  .min(4)
  .describe(
    'A closed linear ring: 4+ [longitude, latitude] coordinate pairs where the first and last pair are identical (e.g. [[-77, 38], [-76, 38], [-76, 39], [-77, 39], [-77, 38]]).'
  );

/**
 * GeoJSON Polygon coordinates — exactly 3 levels of nesting:
 *   polygon  ::= Array<ring>
 *   ring     ::= Array<[lng, lat]>     (first is outer, rest are holes)
 *   coord    ::= [longitude, latitude]
 *
 * Example for a 4-corner box outer ring with no holes:
 *   [[[-77,38],[-76,38],[-76,39],[-77,39],[-77,38]]]
 *
 * If you have a GeoJSON Feature whose `geometry.type === "Polygon"`, use
 * `feature.geometry.coordinates` directly — that's already the right shape.
 *
 * For multi-polygon results (e.g. an isochrone with multiple disconnected
 * regions), pass each polygon separately rather than nesting a MultiPolygon.
 */
export const PolygonSchema = z
  .array(RingSchema)
  .min(1)
  .describe(
    'GeoJSON Polygon coordinates: an array of linear rings. The FIRST ring is the outer boundary; subsequent rings are interior holes. Each ring is an array of 4+ [longitude, latitude] coordinate pairs where the first and last are identical (closed ring). ' +
      'Example with one outer ring and no holes: [[[-77,38],[-76,38],[-76,39],[-77,39],[-77,38]]]. ' +
      'If you have a GeoJSON Feature with type=Polygon, pass `feature.geometry.coordinates` directly.'
  );
