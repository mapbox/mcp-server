// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import {
  pointsWithinPolygon,
  polygon,
  featureCollection,
  point
} from '@turf/turf';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { createLocalToolExecutionContext } from '../../utils/tracing.js';
import { BaseTool } from '../BaseTool.js';
import { PointsWithinPolygonInputSchema } from './PointsWithinPolygonTool.input.schema.js';
import {
  PointsWithinPolygonOutputSchema,
  type PointsWithinPolygonOutput
} from './PointsWithinPolygonTool.output.schema.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export class PointsWithinPolygonTool extends BaseTool<
  typeof PointsWithinPolygonInputSchema,
  typeof PointsWithinPolygonOutputSchema
> {
  readonly name = 'points_within_polygon_tool';
  readonly description =
    'Test one or more geographic points against a polygon, returning only those inside. ' +
    'Handles a single point or a batch of points in one call. ' +
    'Useful for delivery zone validation, fleet geofencing, and customer segmentation. ' +
    'Works offline without API calls.';

  readonly annotations = {
    title: 'Points Within Polygon',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };

  constructor() {
    super({
      inputSchema: PointsWithinPolygonInputSchema,
      outputSchema: PointsWithinPolygonOutputSchema
    });
  }

  async run(rawInput: unknown): Promise<CallToolResult> {
    const toolContext = createLocalToolExecutionContext(this.name, 0);
    return await context.with(
      trace.setSpan(context.active(), toolContext.span),
      async () => {
        try {
          const input = PointsWithinPolygonInputSchema.parse(rawInput);

          const pts = featureCollection(
            input.points.map((p) => point([p.longitude, p.latitude]))
          );
          const poly = polygon(input.polygon);

          const result = pointsWithinPolygon(pts, poly);

          const pointsWithin = result.features.map((f) => ({
            longitude: f.geometry.coordinates[0] as number,
            latitude: f.geometry.coordinates[1] as number
          }));

          const output: PointsWithinPolygonOutput = {
            points_within: pointsWithin,
            count: pointsWithin.length,
            total: input.points.length
          };

          const validated = this.validateOutput(
            output
          ) as PointsWithinPolygonOutput;

          const text =
            `${validated.count} of ${validated.total} points are inside the polygon.\n` +
            (validated.count > 0
              ? validated.points_within
                  .map((p) => `  [${p.longitude}, ${p.latitude}]`)
                  .join('\n')
              : '  (none)');

          toolContext.span.setStatus({ code: SpanStatusCode.OK });
          toolContext.span.end();

          return {
            content: [{ type: 'text' as const, text }],
            structuredContent: validated,
            isError: false
          };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          toolContext.span.setStatus({
            code: SpanStatusCode.ERROR,
            message: errorMessage
          });
          toolContext.span.end();
          return {
            content: [
              {
                type: 'text' as const,
                text: `PointsWithinPolygonTool: ${errorMessage}`
              }
            ],
            isError: true
          };
        }
      }
    );
  }
}
