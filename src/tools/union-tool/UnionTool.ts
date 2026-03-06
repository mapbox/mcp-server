// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { union, polygon, featureCollection } from '@turf/turf';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { createLocalToolExecutionContext } from '../../utils/tracing.js';
import { BaseTool } from '../BaseTool.js';
import { UnionInputSchema } from './UnionTool.input.schema.js';
import {
  UnionOutputSchema,
  type UnionOutput
} from './UnionTool.output.schema.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export class UnionTool extends BaseTool<
  typeof UnionInputSchema,
  typeof UnionOutputSchema
> {
  readonly name = 'union_tool';
  readonly description =
    'Merge two or more polygons into a single unified geometry. ' +
    'Useful for combining service areas, delivery zones, isochrones, or coverage regions. ' +
    'Returns a Polygon or MultiPolygon if the inputs do not overlap. ' +
    'Works offline without API calls.';

  readonly annotations = {
    title: 'Union Polygons',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };

  constructor() {
    super({ inputSchema: UnionInputSchema, outputSchema: UnionOutputSchema });
  }

  async run(rawInput: unknown): Promise<CallToolResult> {
    const toolContext = createLocalToolExecutionContext(this.name, 0);
    return await context.with(
      trace.setSpan(context.active(), toolContext.span),
      async () => {
        try {
          const input = UnionInputSchema.parse(rawInput);

          const polys = input.polygons.map((rings) => polygon(rings));
          // Union all polygons by passing them as a FeatureCollection
          const merged = union(featureCollection(polys));
          if (!merged) throw new Error('Union operation returned null');

          const output: UnionOutput = {
            geometry: merged.geometry as unknown as Record<string, unknown>,
            type: merged.geometry.type
          };

          const validated = this.validateOutput(output) as UnionOutput;

          const text =
            `Union of ${input.polygons.length} polygons computed.\n` +
            `Result type: ${validated.type}\n` +
            `GeoJSON geometry:\n${JSON.stringify(validated.geometry, null, 2)}`;

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
              { type: 'text' as const, text: `UnionTool: ${errorMessage}` }
            ],
            isError: true
          };
        }
      }
    );
  }
}
