// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

export const TilesetLayerSchema = z.object({
  id: z.string(),
  description: z.string().optional(),
  minzoom: z.number().optional(),
  maxzoom: z.number().optional(),
  /** Field name to its type or description, as TileJSON reports it. */
  fields: z.record(z.string(), z.string())
});

export const TilesetExplorerOutputSchema = z.object({
  tilesetExplorer: z.literal(true),
  tileset_id: z.string(),
  name: z.string().optional(),
  type: z.enum(['vector', 'raster']),
  /** [west, south, east, north] */
  bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  /** [longitude, latitude, zoom] */
  center: z.tuple([z.number(), z.number(), z.number()]).optional(),
  minzoom: z.number().optional(),
  maxzoom: z.number().optional(),
  /** Source layers; empty for a raster tileset. */
  layers: z.array(TilesetLayerSchema)
});

export type TilesetLayer = z.infer<typeof TilesetLayerSchema>;
export type TilesetExplorerOutput = z.infer<typeof TilesetExplorerOutputSchema>;
