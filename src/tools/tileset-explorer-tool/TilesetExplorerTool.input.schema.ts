// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

/** `username.id`, or several joined with commas (a composite source). */
export const TILESET_ID_PATTERN =
  /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(,[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)*$/;

export const DEFAULT_TILESET_ID = 'mapbox.mapbox-streets-v8';

export const TilesetExplorerInputSchema = z.object({
  tileset_id: z
    .string()
    .trim()
    .max(500)
    .regex(
      TILESET_ID_PATTERN,
      'Expected username.id, for example mapbox.mapbox-streets-v8'
    )
    .optional()
    .describe(
      `Tileset ID as username.id, for example mapbox.mapbox-streets-v8 or mapbox.satellite. Join several vector tilesets with commas to see them together. Defaults to ${DEFAULT_TILESET_ID}.`
    )
});
