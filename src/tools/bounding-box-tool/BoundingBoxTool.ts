// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import {
  bbox as turfBbox,
  point,
  lineString,
  polygon,
  multiPolygon
} from '@turf/turf';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { createLocalToolExecutionContext } from '../../utils/tracing.js';
import { BaseTool } from '../BaseTool.js';
import { BoundingBoxInputSchema } from './BoundingBoxTool.input.schema.js';
import {
  BoundingBoxOutputSchema,
  type BoundingBoxOutput
} from './BoundingBoxTool.output.schema.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * BoundingBoxTool - Calculate the bounding box of a geometry
 */
export class BoundingBoxTool extends BaseTool<
  typeof BoundingBoxInputSchema,
  typeof BoundingBoxOutputSchema
> {
  readonly name = 'bbox_tool';
  readonly description =
    'Calculate the bounding box (extent) of any geometry. ' +
    'Returns the minimum and maximum longitude and latitude that encompass the geometry. ' +
    'Works offline without API calls.';

  readonly annotations = {
    title: 'Calculate Bounding Box',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };

  constructor() {
    super({
      inputSchema: BoundingBoxInputSchema,
      outputSchema: BoundingBoxOutputSchema
    });
  }

  async run(rawInput: unknown): Promise<CallToolResult> {
    const toolContext = createLocalToolExecutionContext(this.name, 0);
    return await context.with(
      trace.setSpan(context.active(), toolContext.span),
      async () => {
        try {
          const input = BoundingBoxInputSchema.parse(rawInput);

          // Determine geometry type based on structure depth
          let geom;
          const depth = this.getArrayDepth(input.geometry);

          if (depth === 1) {
            // Point [lon, lat]
            geom = point(input.geometry as number[]);
          } else if (depth === 2) {
            // LineString [[lon, lat], [lon, lat], ...]
            geom = lineString(input.geometry as number[][]);
          } else if (depth === 3) {
            // Polygon [[[lon, lat], ...]]
            geom = polygon(input.geometry as number[][][]);
          } else {
            // MultiPolygon [[[[lon, lat], ...]]]
            geom = multiPolygon(input.geometry as number[][][][]);
          }

          const bboxArray = turfBbox(geom);

          const result: BoundingBoxOutput = {
            bbox: [
              Math.round(bboxArray[0] * 1000000) / 1000000,
              Math.round(bboxArray[1] * 1000000) / 1000000,
              Math.round(bboxArray[2] * 1000000) / 1000000,
              Math.round(bboxArray[3] * 1000000) / 1000000
            ]
          };

          const validatedResult = this.validateOutput(
            result
          ) as BoundingBoxOutput;

          const text =
            `Bounding Box: [${validatedResult.bbox[0]}, ${validatedResult.bbox[1]}, ${validatedResult.bbox[2]}, ${validatedResult.bbox[3]}]\n` +
            `Southwest: [${validatedResult.bbox[0]}, ${validatedResult.bbox[1]}]\n` +
            `Northeast: [${validatedResult.bbox[2]}, ${validatedResult.bbox[3]}]`;

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
                text: `BoundingBoxTool: ${errorMessage}`
              }
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
