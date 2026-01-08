// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { area as turfArea, polygon, multiPolygon } from '@turf/turf';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { createLocalToolExecutionContext } from '../../utils/tracing.js';
import { BaseTool } from '../BaseTool.js';
import { AreaInputSchema } from './AreaTool.input.schema.js';
import { AreaOutputSchema, type AreaOutput } from './AreaTool.output.schema.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * AreaTool - Calculate the area of a polygon or multipolygon
 */
export class AreaTool extends BaseTool<
  typeof AreaInputSchema,
  typeof AreaOutputSchema
> {
  readonly name = 'area_tool';
  readonly description =
    'Calculate the area of a polygon or multipolygon. ' +
    'Supports various units including square meters, kilometers, acres, and hectares. ' +
    'Works offline without API calls.';

  readonly annotations = {
    title: 'Calculate Area',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };

  constructor() {
    super({
      inputSchema: AreaInputSchema,
      outputSchema: AreaOutputSchema
    });
  }

  async run(rawInput: unknown): Promise<CallToolResult> {
    const toolContext = createLocalToolExecutionContext(this.name, 0);
    return await context.with(
      trace.setSpan(context.active(), toolContext.span),
      async () => {
        try {
          const input = AreaInputSchema.parse(rawInput);

          // Determine if it's a polygon or multipolygon based on depth
          const isMultiPolygon =
            Array.isArray(input.geometry[0]) &&
            Array.isArray(input.geometry[0][0]) &&
            Array.isArray(input.geometry[0][0][0]);

          const geom = isMultiPolygon
            ? multiPolygon(input.geometry as number[][][][])
            : polygon(input.geometry as number[][][]);

          // Calculate area in square meters first
          const areaInSquareMeters = turfArea(geom);

          // Convert to requested units
          let area: number;
          switch (input.units) {
            case 'meters':
              area = areaInSquareMeters;
              break;
            case 'kilometers':
              area = areaInSquareMeters / 1000000;
              break;
            case 'feet':
              area = areaInSquareMeters * 10.7639;
              break;
            case 'miles':
              area = areaInSquareMeters / 2589988.11;
              break;
            case 'acres':
              area = areaInSquareMeters / 4046.86;
              break;
            case 'hectares':
              area = areaInSquareMeters / 10000;
              break;
            default:
              area = areaInSquareMeters;
          }

          const result: AreaOutput = {
            area: Math.round(area * 1000) / 1000,
            units: input.units
          };

          const validatedResult = this.validateOutput(result) as AreaOutput;

          const text = `Area: ${validatedResult.area} square ${validatedResult.units}`;

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
              { type: 'text' as const, text: `AreaTool: ${errorMessage}` }
            ],
            isError: true
          };
        }
      }
    );
  }
}
