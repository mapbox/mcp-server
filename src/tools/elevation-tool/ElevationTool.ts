// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { HttpRequest } from '../../utils/types.js';
import type { MapAppMarker, MapAppPayload } from '../../utils/mapAppPayload.js';
import { buildInlinePayloadRef } from '../../utils/inlinePayloadRef.js';
import { renderHint } from '../../utils/storeMapPayload.js';
import { directionsRequestFromRef } from '../../utils/directionsRef.js';
import { ElevationInputSchema } from './ElevationTool.input.schema.js';
import {
  ElevationOutputSchema,
  type ElevationOutput
} from './ElevationTool.output.schema.js';
import {
  MAX_ZOOM,
  TERRAIN_TILESET,
  TerrainTileError,
  chooseZoom,
  climbAndDescent,
  elevationsAt,
  pathLength,
  pixelSizeMeters,
  samplePath,
  type LngLat
} from './terrain.js';

/** Most points sampled along a path; long paths get wider spacing. */
const MAX_SAMPLES = 500;
const PROFILE_POINTS = 50;
/** The text gets a shorter profile; the full one is in structuredContent. */
const TEXT_PROFILE_POINTS = 12;

type PathPoint = NonNullable<ElevationOutput['path']>['start'];

function round(value: number, digits = 1): number {
  const f = 10 ** digits;
  // `|| 0` turns -0 into 0, so it never prints as "-0".
  return Math.round(value * f) / f || 0;
}

function formatMeters(value: number): string {
  return `${(Math.round(value) || 0).toLocaleString('en-US')} m`;
}

function formatDistance(meters: number): string {
  return meters >= 1000
    ? `${round(meters / 1000).toLocaleString('en-US')} km`
    : `${Math.round(meters)} m`;
}

/**
 * ElevationTool: ground elevation at points, or climb, descent and a
 * profile along a path or a directions_tool route, from Mapbox's terrain
 * DEM tiles (decoded on the server, so no Tilequery contour rounding).
 */
export class ElevationTool extends MapboxApiBasedTool<
  typeof ElevationInputSchema,
  typeof ElevationOutputSchema
> {
  name = 'elevation_tool';
  description =
    'Gets ground elevation from Mapbox terrain data. Give it places (`points`) for the height above sea level of each, ' +
    'or a line (`path`, or `directions_ref` from a directions_tool result) for total climb and descent, the highest and lowest points, and an elevation profile. ' +
    'Use it for questions like "how high is this town?", "how hilly is this bike route?" or "how much climbing is on this hike?". ' +
    'Elevations are of the ground (bare earth), not buildings or bridges. ' +
    'Long paths are read at a coarser resolution (see `resolution_m` in the result), which can undercount small hills.';
  annotations = {
    title: 'Elevation Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };

  constructor({ httpRequest }: { httpRequest: HttpRequest }) {
    super({
      inputSchema: ElevationInputSchema,
      outputSchema: ElevationOutputSchema,
      httpRequest
    });
  }

  protected async execute(
    input: z.infer<typeof ElevationInputSchema>,
    accessToken: string
  ): Promise<CallToolResult> {
    const given = [input.points, input.path, input.directions_ref].filter(
      (v) => v !== undefined
    ).length;
    if (given !== 1) {
      return this.error('Pass exactly one of points, path or directions_ref.');
    }

    const apiEndpoint = MapboxApiBasedTool.mapboxApiEndpoint;
    const options = { httpRequest: this.httpRequest, accessToken, apiEndpoint };

    try {
      if (input.points) {
        const points = input.points.map(
          (p) => [p.longitude, p.latitude] as LngLat
        );
        const heights = await elevationsAt(points, MAX_ZOOM, options);
        return this.pointsResult(points, heights);
      }

      let line: LngLat[];
      let drawLine = false;
      if (input.path) {
        line = input.path.map((p) => [p.longitude, p.latitude] as LngLat);
        drawLine = true;
      } else {
        const route = await this.fetchRoute(
          input.directions_ref as string,
          accessToken,
          apiEndpoint
        );
        if (typeof route === 'string') return this.error(route);
        line = route;
      }
      return await this.pathResult(line, drawLine, options);
    } catch (error) {
      if (error instanceof TerrainTileError) {
        return this.error(
          error.status === 401 || error.status === 403
            ? `Terrain tiles refused the access token (${error.status}). Check that the token is valid and can read Mapbox tilesets, which default public tokens can.`
            : error.message
        );
      }
      throw error;
    }
  }

  private error(text: string): CallToolResult {
    return { content: [{ type: 'text', text }], isError: true };
  }

  /** The route's coordinates, or an error message for the model. */
  private async fetchRoute(
    ref: string,
    accessToken: string,
    apiEndpoint: string
  ): Promise<LngLat[] | string> {
    const request = directionsRequestFromRef(ref, { accessToken, apiEndpoint });
    if (!request) {
      return 'directions_ref is not a directions_tool ref. Pass the structuredContent.mapboxRender.ref from a directions_tool result unchanged, or pass the line as path.';
    }
    const response = await this.httpRequest(request.url);
    if (!response.ok) {
      return `Directions API error: ${await this.getErrorMessage(response)}`;
    }
    const data = (await response.json()) as {
      routes?: Array<{ geometry?: { coordinates?: unknown } }>;
    };
    const coords =
      data.routes?.[request.selectedRouteIndex ?? 0]?.geometry?.coordinates ??
      data.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      return 'The Directions API returned no route for that ref.';
    }
    return coords as LngLat[];
  }

  private pointsResult(points: LngLat[], heights: number[]): CallToolResult {
    const out: ElevationOutput = {
      source: TERRAIN_TILESET,
      zoom: MAX_ZOOM,
      resolution_m: round(pixelSizeMeters(MAX_ZOOM, points[0][1])),
      points: points.map((p, i) => ({
        longitude: p[0],
        latitude: p[1],
        elevation_m: round(heights[i])
      }))
    };
    const markers: MapAppMarker[] = points.map((p, i) => ({
      coordinates: p,
      style: 'pin',
      popup: formatMeters(heights[i])
    }));
    const ref = buildInlinePayloadRef({
      summary:
        points.length === 1
          ? `Elevation ${formatMeters(heights[0])}`
          : 'Elevations',
      layers: [],
      markers
    });
    out.mapboxRender = { ref };

    const lines = points.map(
      (p, i) =>
        `${points.length > 1 ? `${i + 1}. ` : ''}${formatMeters(heights[i])} at ${p[1].toFixed(5)}, ${p[0].toFixed(5)}`
    );
    const text = `Ground elevation (${TERRAIN_TILESET}, about ${out.resolution_m} m resolution):\n${lines.join('\n')}`;
    return {
      content: [{ type: 'text', text: text + renderHint(ref) }],
      structuredContent: out,
      isError: false
    };
  }

  private async pathResult(
    line: LngLat[],
    drawLine: boolean,
    options: Parameters<typeof elevationsAt>[2]
  ): Promise<CallToolResult> {
    const length = pathLength(line);
    const finest = pixelSizeMeters(MAX_ZOOM, line[0][1]);
    const spacing = Math.max(finest, length / (MAX_SAMPLES - 1));
    const samples = samplePath(line, spacing);
    const points = samples.map((s) => s.point);
    const zoom = chooseZoom(points);
    const heights = await elevationsAt(points, zoom, options);

    const at = (i: number): PathPoint => ({
      longitude: points[i][0],
      latitude: points[i][1],
      elevation_m: round(heights[i]),
      distance_m: Math.round(samples[i].distance)
    });
    let hi = 0;
    let lo = 0;
    heights.forEach((h, i) => {
      if (h > heights[hi]) hi = i;
      if (h < heights[lo]) lo = i;
    });
    const { climb, descent } = climbAndDescent(heights);
    const step = Math.max(1, (samples.length - 1) / (PROFILE_POINTS - 1));
    const profile: Array<{ distance_m: number; elevation_m: number }> = [];
    for (let k = 0; k < samples.length; k += step) {
      const i = Math.round(k);
      profile.push({
        distance_m: Math.round(samples[i].distance),
        elevation_m: round(heights[i])
      });
    }
    if (profile[profile.length - 1].distance_m !== Math.round(length)) {
      const last = samples.length - 1;
      profile.push({
        distance_m: Math.round(samples[last].distance),
        elevation_m: round(heights[last])
      });
    }

    const resolution = round(pixelSizeMeters(zoom, line[0][1]));
    const out: ElevationOutput = {
      source: TERRAIN_TILESET,
      zoom,
      resolution_m: resolution,
      path: {
        distance_m: Math.round(length),
        sample_spacing_m: round(spacing),
        sample_count: samples.length,
        climb_m: Math.round(climb),
        descent_m: Math.round(descent),
        start: at(0),
        end: at(samples.length - 1),
        highest: at(hi),
        lowest: at(lo),
        profile
      }
    };

    const payload: MapAppPayload = {
      summary: `Climb ${formatMeters(climb)} · descent ${formatMeters(descent)}`,
      layers: drawLine
        ? [
            {
              id: 'elevation-path',
              type: 'line',
              data: {
                type: 'Feature',
                properties: {},
                geometry: { type: 'LineString', coordinates: line }
              },
              paint: { 'line-color': '#3b82f6', 'line-width': 4 },
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              slot: 'top'
            }
          ]
        : [],
      markers: [
        {
          coordinates: points[hi],
          style: 'numbered',
          label: '▲',
          color: '#b45309',
          popup: `Highest: ${formatMeters(heights[hi])} at ${formatDistance(samples[hi].distance)}`
        },
        {
          coordinates: points[lo],
          style: 'numbered',
          label: '▼',
          color: '#0369a1',
          popup: `Lowest: ${formatMeters(heights[lo])} at ${formatDistance(samples[lo].distance)}`
        }
      ]
    };
    const ref = buildInlinePayloadRef(payload);
    out.mapboxRender = { ref };

    const p = out.path!;
    const text = [
      `Elevation along ${formatDistance(length)} (${TERRAIN_TILESET}, ${samples.length} samples, about ${resolution} m resolution):`,
      `Climb: ${formatMeters(climb)}, descent: ${formatMeters(descent)}`,
      `Start: ${formatMeters(p.start.elevation_m)}, end: ${formatMeters(p.end.elevation_m)}`,
      `Highest: ${formatMeters(p.highest.elevation_m)} at ${formatDistance(p.highest.distance_m)}`,
      `Lowest: ${formatMeters(p.lowest.elevation_m)} at ${formatDistance(p.lowest.distance_m)}`,
      `Profile (distance, elevation): ${profile
        .filter(
          (_, i) =>
            i === profile.length - 1 ||
            i % Math.ceil(profile.length / TEXT_PROFILE_POINTS) === 0
        )
        .map(
          (q) =>
            `${formatDistance(q.distance_m)} ${formatMeters(q.elevation_m)}`
        )
        .join('; ')}`
    ].join('\n');
    const hint = drawLine
      ? renderHint(ref)
      : renderHint(ref) +
        '\nTo show the route too, pass the directions ref alongside it in payload_refs.';
    return {
      content: [{ type: 'text', text: text + hint }],
      structuredContent: out,
      isError: false
    };
  }
}
