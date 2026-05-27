// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { randomUUID } from 'node:crypto';
import {
  difference,
  featureCollection,
  intersect,
  polygon as turfPolygon,
  union
} from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import type { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BaseTool } from '../BaseTool.js';
import {
  UnionAppInputSchema,
  IntersectAppInputSchema,
  DifferenceAppInputSchema
} from './PolygonOpsAppTool.input.schema.js';

// All three tools share the same MCP App UI resource — the renderer just
// shows the input polygons in muted blue and the result polygon highlighted.

const POLYGON_OPS_META = {
  ui: {
    resourceUri: 'ui://mapbox/polygon-ops-app/index.html',
    csp: {
      connectDomains: ['https://*.mapbox.com', 'https://events.mapbox.com'],
      resourceDomains: ['https://api.mapbox.com']
    }
  }
};

function ringsToPolygonFeature(rings: number[][][]): Feature<Polygon> {
  return turfPolygon(rings as Polygon['coordinates']) as Feature<Polygon>;
}

function buildPayload(params: {
  operation: 'union' | 'intersect' | 'difference';
  inputs: Array<{ type: 'Feature'; geometry: Polygon }>;
  result: Feature<Polygon | MultiPolygon> | null;
}) {
  const { operation, inputs, result } = params;
  const summary = result
    ? `${operation} produced a ${result.geometry.type}`
    : `${operation} produced no overlapping geometry`;

  return {
    summary,
    operation,
    inputs,
    result: result ?? null
  };
}

function buildResponse(
  payload: ReturnType<typeof buildPayload>
): CallToolResult {
  return {
    content: [
      { type: 'text', text: payload.summary },
      { type: 'text', text: JSON.stringify(payload) }
    ],
    structuredContent: { polygon_ops: payload },
    isError: false,
    _meta: { viewUUID: randomUUID() }
  };
}

// ---------------------------------------------------------------------------
// UnionAppTool
// ---------------------------------------------------------------------------
export class UnionAppTool extends BaseTool<typeof UnionAppInputSchema> {
  name = 'union_app_tool';
  description =
    'Merge two or more polygons into a single union geometry and render the inputs + result on an interactive Mapbox GL JS map (MCP App). ' +
    'Useful for visualizing service-area or delivery-zone consolidation.';
  annotations = {
    title: 'Union App Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };
  readonly meta = POLYGON_OPS_META;

  constructor() {
    super({ inputSchema: UnionAppInputSchema });
  }

  async run(rawInput: unknown): Promise<CallToolResult> {
    const input = this.inputSchema.parse(rawInput) as z.infer<
      typeof this.inputSchema
    >;
    return this.executeImpl(input);
  }

  protected async executeImpl(
    input: z.infer<typeof UnionAppInputSchema>
  ): Promise<CallToolResult> {
    const features = input.polygons.map(ringsToPolygonFeature);
    const result = union(featureCollection(features)) as Feature<
      Polygon | MultiPolygon
    > | null;

    return buildResponse(
      buildPayload({ operation: 'union', inputs: features, result })
    );
  }
}

// ---------------------------------------------------------------------------
// IntersectAppTool
// ---------------------------------------------------------------------------
export class IntersectAppTool extends BaseTool<typeof IntersectAppInputSchema> {
  name = 'intersect_app_tool';
  description =
    'Find the intersection (shared area) of two polygons and render the inputs + result on an interactive Mapbox GL JS map (MCP App).';
  annotations = {
    title: 'Intersect App Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };
  readonly meta = POLYGON_OPS_META;

  constructor() {
    super({ inputSchema: IntersectAppInputSchema });
  }

  async run(rawInput: unknown): Promise<CallToolResult> {
    const input = this.inputSchema.parse(rawInput) as z.infer<
      typeof this.inputSchema
    >;
    return this.executeImpl(input);
  }

  protected async executeImpl(
    input: z.infer<typeof IntersectAppInputSchema>
  ): Promise<CallToolResult> {
    const p1 = ringsToPolygonFeature(input.polygon1);
    const p2 = ringsToPolygonFeature(input.polygon2);
    const result = intersect(featureCollection([p1, p2])) as Feature<
      Polygon | MultiPolygon
    > | null;

    return buildResponse(
      buildPayload({ operation: 'intersect', inputs: [p1, p2], result })
    );
  }
}

// ---------------------------------------------------------------------------
// DifferenceAppTool
// ---------------------------------------------------------------------------
export class DifferenceAppTool extends BaseTool<
  typeof DifferenceAppInputSchema
> {
  name = 'difference_app_tool';
  description =
    'Subtract one polygon from another (polygon1 minus polygon2) and render the inputs + result on an interactive Mapbox GL JS map (MCP App). ' +
    'Useful for "what is in zone A but NOT in zone B" type questions.';
  annotations = {
    title: 'Difference App Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };
  readonly meta = POLYGON_OPS_META;

  constructor() {
    super({ inputSchema: DifferenceAppInputSchema });
  }

  async run(rawInput: unknown): Promise<CallToolResult> {
    const input = this.inputSchema.parse(rawInput) as z.infer<
      typeof this.inputSchema
    >;
    return this.executeImpl(input);
  }

  protected async executeImpl(
    input: z.infer<typeof DifferenceAppInputSchema>
  ): Promise<CallToolResult> {
    const p1 = ringsToPolygonFeature(input.polygon1);
    const p2 = ringsToPolygonFeature(input.polygon2);
    const result = difference(featureCollection([p1, p2])) as Feature<
      Polygon | MultiPolygon
    > | null;

    return buildResponse(
      buildPayload({ operation: 'difference', inputs: [p1, p2], result })
    );
  }
}
