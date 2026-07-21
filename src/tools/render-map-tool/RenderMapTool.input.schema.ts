// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

/**
 * Input schema for `render_map_tool` — a `MapAppPayload` describing what to
 * draw. The LLM either passes through the `mapboxRender` field returned by any
 * Mapbox geo tool, or composes a payload from raw GeoJSON.
 *
 * Mirrors the runtime `MapAppPayload` type (src/utils/mapAppPayload.ts) but
 * declared as a Zod schema for input validation. The two MUST stay in sync.
 */

const layerSchema = z.object({
  id: z.string().describe('Unique layer/source id within the payload'),
  type: z
    .enum(['fill', 'line', 'circle', 'symbol'])
    .describe('Mapbox GL layer type'),
  data: z
    .unknown()
    .describe(
      'GeoJSON Feature or FeatureCollection. Geometry must be one of: Point, LineString, Polygon, MultiPolygon. Coordinates are [longitude, latitude] order.'
    ),
  paint: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      'Mapbox Style Spec paint object passed through to addLayer (e.g. { "line-color": "#3b82f6", "line-width": 5 })'
    ),
  layout: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      'Mapbox Style Spec layout object (e.g. { "line-join": "round", "line-cap": "round" })'
    )
});

const markerSchema = z.object({
  coordinates: z
    .array(z.number())
    .min(2)
    .max(2)
    .describe('[longitude, latitude]'),
  style: z
    .enum(['pin', 'numbered', 'start', 'end'])
    .optional()
    .describe(
      'Visual style. "pin" is the default Mapbox marker. "numbered" is a circular badge containing `label`. "start"/"end" are green/red badges for route endpoints.'
    ),
  label: z
    .string()
    .optional()
    .describe('Required when style="numbered" (e.g. visit order "1", "2", …)'),
  color: z
    .string()
    .optional()
    .describe('Optional CSS color override (defaults are style-derived)'),
  popup: z.string().optional().describe('Popup text shown on marker click')
});

const legendEntrySchema = z.object({
  label: z.string(),
  color: z.string().describe('CSS color of the swatch'),
  opacity: z.number().min(0).max(1).optional()
});

const cameraSchema = z.object({
  center: z.array(z.number()).min(2).max(2).optional(),
  zoom: z.number().optional(),
  bounds: z
    .array(z.array(z.number()).min(2).max(2))
    .min(2)
    .max(2)
    .optional()
    .describe(
      '[[minLng, minLat], [maxLng, maxLat]]. If set, takes precedence over center/zoom and auto-fit.'
    )
});

export const RenderMapInputSchema = z.object({
  /**
   * Preferred way to pass data from another Mapbox tool. Every geo tool
   * stashes its map payload server-side and returns a short ref in
   * `structuredContent.mapboxRender.ref` — pass that ref (or several, to merge
   * multiple datasets onto one map) here. Avoids streaming thousands of
   * coordinate pairs back through the model.
   */
  payload_refs: z
    .array(z.string())
    .optional()
    .describe(
      'Array of map-payload URIs returned by other Mapbox tools in their structuredContent.mapboxRender.ref field. Pass one ref to render a single tool result; pass multiple to merge several datasets onto one map (e.g. an isochrone + a route).'
    ),
  summary: z
    .string()
    .optional()
    .describe(
      'Short header chip shown in the top-left of the map (e.g. "Route: 12.4 mi, 23 min"). Overrides any summary in payload_refs.'
    ),
  layers: z
    .array(layerSchema)
    .optional()
    .describe(
      'Inline layers to add to the map. Use this only when composing a payload from raw GeoJSON; for tool results, pass payload_refs instead.'
    ),
  markers: z
    .array(markerSchema)
    .optional()
    .describe(
      'Inline point markers (start/end, numbered visits, POI pins, etc.). Use only for hand-composed payloads.'
    ),
  legend: z
    .array(legendEntrySchema)
    .optional()
    .describe('Inline legend rows. Use only for hand-composed payloads.'),
  camera: cameraSchema
    .optional()
    .describe(
      'Initial camera position. If omitted, the map auto-fits to the union of all data.'
    )
});

export type RenderMapInput = z.infer<typeof RenderMapInputSchema>;
