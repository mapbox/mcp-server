// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { booleanPointInPolygon, polygon, point } from '@turf/turf';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { createLocalToolExecutionContext } from '../../utils/tracing.js';
import { BaseTool } from '../BaseTool.js';
import { PointInPolygonInputSchema } from './PointInPolygonTool.input.schema.js';
import {
  PointInPolygonOutputSchema,
  type PointInPolygonOutput
} from './PointInPolygonTool.output.schema.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * PointInPolygonTool - Test if a point is inside a polygon
 *
 * This is an offline tool that performs local geometric calculations without API calls.
 * Useful for spatial queries like "is this delivery point within this service area?"
 */
export class PointInPolygonTool extends BaseTool<
  typeof PointInPolygonInputSchema,
  typeof PointInPolygonOutputSchema
> {
  readonly name = 'point_in_polygon_tool';
  readonly description =
    'Test if a geographic point is inside a polygon. ' +
    'Useful for determining if a location is within a boundary, service area, or region. ' +
    'Handles polygons with holes. Works offline without API calls.';

  readonly annotations = {
    title: 'Point in Polygon Test',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };

  constructor() {
    super({
      inputSchema: PointInPolygonInputSchema,
      outputSchema: PointInPolygonOutputSchema
    });
  }

  async run(rawInput: unknown): Promise<CallToolResult> {
    const toolContext = createLocalToolExecutionContext(this.name, 0);
    return await context.with(
      trace.setSpan(context.active(), toolContext.span),
      async () => {
        try {
          const input = PointInPolygonInputSchema.parse(rawInput);

          // Create Turf geometries
          const pt = point([input.point.longitude, input.point.latitude]);
          const poly = polygon(input.polygon);

          // Test if point is inside polygon
          const inside = booleanPointInPolygon(pt, poly);

          const result: PointInPolygonOutput = {
            inside,
            point: input.point
          };

          const validatedResult = this.validateOutput(
            result
          ) as PointInPolygonOutput;

          const text = validatedResult.inside
            ? `✓ Point [${validatedResult.point.longitude}, ${validatedResult.point.latitude}] is INSIDE the polygon`
            : `✗ Point [${validatedResult.point.longitude}, ${validatedResult.point.latitude}] is OUTSIDE the polygon`;

          toolContext.span.setStatus({ code: SpanStatusCode.OK });
          toolContext.span.end();

          return {
            content: [{ type: 'text' as const, text }],
            structuredContent: validatedResult,
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
          this.log('error', `${this.name}: ${errorMessage}`);
          return {
            content: [
              {
                type: 'text' as const,
                text: `PointInPolygonTool: ${errorMessage}`
              }
            ],
            isError: true
          };
        }
      }
    );
  }
}
