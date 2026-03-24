// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { difference, polygon, featureCollection } from '@turf/turf';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { createLocalToolExecutionContext } from '../../utils/tracing.js';
import { BaseTool } from '../BaseTool.js';
import { DifferenceInputSchema } from './DifferenceTool.input.schema.js';
import {
  DifferenceOutputSchema,
  type DifferenceOutput
} from './DifferenceTool.output.schema.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export class DifferenceTool extends BaseTool<
  typeof DifferenceInputSchema,
  typeof DifferenceOutputSchema
> {
  readonly name = 'difference_tool';
  readonly description =
    'Subtract one polygon from another, returning the area in polygon1 that is not covered by polygon2. ' +
    'Useful for computing exclusion zones, finding uncovered service areas, or "what is in zone A but not zone B?". ' +
    'Returns null geometry if polygon2 fully covers polygon1. ' +
    'Works offline without API calls.';

  readonly annotations = {
    title: 'Difference of Polygons',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };

  constructor() {
    super({
      inputSchema: DifferenceInputSchema,
      outputSchema: DifferenceOutputSchema
    });
  }

  async run(rawInput: unknown): Promise<CallToolResult> {
    const toolContext = createLocalToolExecutionContext(this.name, 0);
    return await context.with(
      trace.setSpan(context.active(), toolContext.span),
      async () => {
        try {
          const input = DifferenceInputSchema.parse(rawInput);

          const poly1 = polygon(input.polygon1);
          const poly2 = polygon(input.polygon2);
          const result = difference(featureCollection([poly1, poly2]));

          const output: DifferenceOutput = {
            has_difference: result !== null,
            geometry: result
              ? (result.geometry as unknown as Record<string, unknown>)
              : null
          };

          const validated = this.validateOutput(output) as DifferenceOutput;

          const text = validated.has_difference
            ? `Difference computed (area in polygon1 not covered by polygon2).\nGeometry:\n${JSON.stringify(validated.geometry, null, 2)}`
            : 'No difference: polygon2 fully covers polygon1.';

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
              { type: 'text' as const, text: `DifferenceTool: ${errorMessage}` }
            ],
            isError: true
          };
        }
      }
    );
  }
}
