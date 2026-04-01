// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

export const CoordinateSchema = z
  .array(z.number())
  .length(2)
  .describe('Coordinate as [longitude, latitude]');

export const PolygonSchema = z
  .array(z.array(CoordinateSchema))
  .min(1)
  .describe(
    'Polygon coordinates as array of rings (first is outer, rest are holes). Each ring is [longitude, latitude] pairs.'
  );
