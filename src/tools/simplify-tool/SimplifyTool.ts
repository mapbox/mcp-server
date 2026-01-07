// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { simplify as turfSimplify, lineString, polygon } from '@turf/turf';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { createLocalToolExecutionContext } from '../../utils/tracing.js';
import { BaseTool } from '../BaseTool.js';
import { SimplifyInputSchema } from './SimplifyTool.input.schema.js';
import {
  SimplifyOutputSchema,
  type SimplifyOutput
} from './SimplifyTool.output.schema.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * SimplifyTool - Simplify geometries by reducing vertex count
 */
export class SimplifyTool extends BaseTool<
  typeof SimplifyInputSchema,
  typeof SimplifyOutputSchema
> {
  readonly name = 'simplify_tool';
  readonly description =
    'Simplify a LineString or Polygon by reducing the number of vertices while preserving the general shape. ' +
    'Uses the Douglas-Peucker algorithm. Useful for reducing file sizes and improving rendering performance. ' +
    'Works offline without API calls.';

  readonly annotations = {
    title: 'Simplify Geometry',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };

  constructor() {
    super({
      inputSchema: SimplifyInputSchema,
      outputSchema: SimplifyOutputSchema
    });
  }

  async run(rawInput: unknown): Promise<CallToolResult> {
    const toolContext = createLocalToolExecutionContext(this.name, 0);
    return await context.with(
      trace.setSpan(context.active(), toolContext.span),
      async () => {
        try {
          const input = SimplifyInputSchema.parse(rawInput);

          // Determine if it's a LineString or Polygon
          const isPolygon =
            Array.isArray(input.geometry[0]) &&
            Array.isArray(input.geometry[0][0]);

          const geom = isPolygon
            ? polygon(input.geometry as number[][][])
            : lineString(input.geometry as number[][]);

          // Count original vertices
          const originalVertexCount = this.countVertices(input.geometry);

          // Simplify the geometry
          const simplified = turfSimplify(geom, {
            tolerance: input.tolerance,
            highQuality: input.highQuality
          });

          // Extract simplified coordinates
          const simplifiedCoords = simplified.geometry.coordinates;

          // Count simplified vertices
          const simplifiedVertexCount = this.countVertices(simplifiedCoords);

          // Calculate reduction percentage
          const reductionPercentage = Math.round(
            ((originalVertexCount - simplifiedVertexCount) /
              originalVertexCount) *
              100
          );

          const result: SimplifyOutput = {
            simplified: simplifiedCoords as any,
            originalVertexCount,
            simplifiedVertexCount,
            reductionPercentage
          };

          const validatedResult = this.validateOutput(result) as SimplifyOutput;

          const text =
            `Geometry simplified:\n` +
            `Original vertices: ${validatedResult.originalVertexCount}\n` +
            `Simplified vertices: ${validatedResult.simplifiedVertexCount}\n` +
            `Reduction: ${validatedResult.reductionPercentage}%`;

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
              { type: 'text' as const, text: `SimplifyTool: ${errorMessage}` }
            ],
            isError: true
          };
        }
      }
    );
  }

  private countVertices(coords: unknown): number {
    if (!Array.isArray(coords)) return 0;
    if (typeof coords[0] === 'number') return 1;
    if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
      return coords.length;
    }
    // Polygon - count all vertices in all rings
    return coords.reduce(
      (sum, ring) => sum + (Array.isArray(ring) ? ring.length : 0),
      0
    );
  }
}
