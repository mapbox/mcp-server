// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { buffer as turfBuffer, point, lineString, polygon } from '@turf/turf';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { createLocalToolExecutionContext } from '../../utils/tracing.js';
import { BaseTool } from '../BaseTool.js';
import { BufferInputSchema } from './BufferTool.input.schema.js';
import {
  BufferOutputSchema,
  type BufferOutput
} from './BufferTool.output.schema.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * BufferTool - Create a buffer zone around a geometry
 */
export class BufferTool extends BaseTool<
  typeof BufferInputSchema,
  typeof BufferOutputSchema
> {
  readonly name = 'buffer_tool';
  readonly description =
    'Create a buffer zone (polygon) around a point, line, or polygon at a specified distance. ' +
    'Useful for proximity analysis, service areas, or creating zones of influence. ' +
    'Works offline without API calls.';

  readonly annotations = {
    title: 'Create Buffer Zone',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };

  constructor() {
    super({
      inputSchema: BufferInputSchema,
      outputSchema: BufferOutputSchema
    });
  }

  async run(rawInput: unknown): Promise<CallToolResult> {
    const toolContext = createLocalToolExecutionContext(this.name, 0);
    return await context.with(
      trace.setSpan(context.active(), toolContext.span),
      async () => {
        try {
          const input = BufferInputSchema.parse(rawInput);

          // Determine geometry type based on structure
          let geom;
          const depth = this.getArrayDepth(input.geometry);

          if (depth === 1) {
            // Point [lon, lat]
            geom = point(input.geometry as number[]);
          } else if (depth === 2) {
            // LineString [[lon, lat], [lon, lat], ...]
            geom = lineString(input.geometry as number[][]);
          } else {
            // Polygon [[[lon, lat], ...]]
            geom = polygon(input.geometry as number[][][]);
          }

          const buffered = turfBuffer(geom, input.distance, {
            units: input.units
          });

          if (!buffered || buffered.geometry.type !== 'Polygon') {
            throw new Error('Buffer operation did not produce a valid polygon');
          }

          const result: BufferOutput = {
            bufferedPolygon: buffered.geometry.coordinates as [
              number,
              number
            ][][],
            distance: input.distance,
            units: input.units
          };

          const validatedResult = this.validateOutput(result) as BufferOutput;

          const ringCount = validatedResult.bufferedPolygon.length;
          const text =
            `Buffer zone created: ${validatedResult.distance} ${validatedResult.units}\n` +
            `Result: Polygon with ${ringCount} ring${ringCount !== 1 ? 's' : ''} ` +
            `(${validatedResult.bufferedPolygon[0].length} vertices in outer ring)`;

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
              { type: 'text' as const, text: `BufferTool: ${errorMessage}` }
            ],
            isError: true
          };
        }
      }
    );
  }

  private getArrayDepth(arr: unknown): number {
    if (!Array.isArray(arr)) return 0;
    if (!Array.isArray(arr[0])) return 1;
    return 1 + this.getArrayDepth(arr[0]);
  }
}
