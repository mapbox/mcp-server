// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { centroid as turfCentroid, polygon, multiPolygon } from '@turf/turf';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { createLocalToolExecutionContext } from '../../utils/tracing.js';
import { BaseTool } from '../BaseTool.js';
import { CentroidInputSchema } from './CentroidTool.input.schema.js';
import {
  CentroidOutputSchema,
  type CentroidOutput
} from './CentroidTool.output.schema.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * CentroidTool - Calculate the center point (centroid) of a polygon or multipolygon
 */
export class CentroidTool extends BaseTool<
  typeof CentroidInputSchema,
  typeof CentroidOutputSchema
> {
  readonly name = 'centroid_tool';
  readonly description =
    'Calculate the geometric center (centroid) of a polygon or multipolygon. ' +
    'The centroid is the arithmetic mean position of all points in the shape. ' +
    'Works offline without API calls.';

  readonly annotations = {
    title: 'Calculate Centroid',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };

  constructor() {
    super({
      inputSchema: CentroidInputSchema,
      outputSchema: CentroidOutputSchema
    });
  }

  async run(rawInput: unknown): Promise<CallToolResult> {
    const toolContext = createLocalToolExecutionContext(this.name, 0);
    return await context.with(
      trace.setSpan(context.active(), toolContext.span),
      async () => {
        try {
          const input = CentroidInputSchema.parse(rawInput);

          // Determine if it's a polygon or multipolygon based on depth
          const isMultiPolygon =
            Array.isArray(input.geometry[0]) &&
            Array.isArray(input.geometry[0][0]) &&
            Array.isArray(input.geometry[0][0][0]);

          const geom = isMultiPolygon
            ? multiPolygon(input.geometry as number[][][][])
            : polygon(input.geometry as number[][][]);

          const center = turfCentroid(geom);

          const result: CentroidOutput = {
            centroid: {
              longitude:
                Math.round(center.geometry.coordinates[0] * 1000000) / 1000000,
              latitude:
                Math.round(center.geometry.coordinates[1] * 1000000) / 1000000
            }
          };

          const validatedResult = this.validateOutput(result) as CentroidOutput;

          const text = `Centroid: [${validatedResult.centroid.longitude}, ${validatedResult.centroid.latitude}]`;

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
              { type: 'text' as const, text: `CentroidTool: ${errorMessage}` }
            ],
            isError: true
          };
        }
      }
    );
  }
}
