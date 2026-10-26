// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { StandardSchemaWithJSON } from '@modelcontextprotocol/server';
import type { ZodTypeAny } from 'zod';

/**
 * Wraps a tool's output schema so McpServer still publishes it in
 * `tools/list` but doesn't fail the call when `structuredContent` doesn't
 * match it.
 *
 * McpServer turns an output-schema mismatch into an error result, which
 * throws away a response the model could have used because an upstream API
 * added or changed a field. SDK v1 needed a patch to the SDK for this (see
 * patches/README.md); v2 takes any Standard Schema, so this keeps the
 * schema's JSON Schema and swaps in a validator that logs the mismatch to
 * stderr and passes the data through unchanged.
 */
export function lenientOutputSchema(
  schema: ZodTypeAny,
  toolName: string
): StandardSchemaWithJSON {
  const standard = (schema as unknown as StandardSchemaWithJSON)['~standard'];
  return {
    '~standard': {
      version: 1,
      vendor: standard.vendor,
      jsonSchema: standard.jsonSchema,
      validate: async (value: unknown) => {
        const result = await standard.validate(value);
        if (result.issues?.length) {
          console.warn(
            `Output validation warning: structured content for tool ${toolName} doesn't match its output schema: ` +
              result.issues.map((issue) => issue.message).join(', ')
          );
        }
        return { value };
      }
    }
  } as StandardSchemaWithJSON;
}
