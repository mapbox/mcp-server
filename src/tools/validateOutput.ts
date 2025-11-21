// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { ZodTypeAny } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Validates the structured content against the output schema.
 * If validation fails, returns a safe fallback response that includes
 * the raw data as JSON text but omits the structuredContent field.
 *
 * This prevents MCP protocol-level validation errors when the API
 * returns data that doesn't match the expected schema.
 */
export function validateAndSanitizeOutput<OutputSchema extends ZodTypeAny>(
  result: CallToolResult,
  outputSchema?: OutputSchema,
  toolName?: string
): CallToolResult {
  // If no output schema is defined, return as-is
  if (!outputSchema) {
    return result;
  }

  // If the result is an error or has no structuredContent, return as-is
  if (result.isError || !result.structuredContent) {
    return result;
  }

  try {
    // Try to parse the structured content with the schema
    const parsed = outputSchema.parse(result.structuredContent);

    // If successful, return the result with validated structured content
    return {
      ...result,
      structuredContent: parsed
    };
  } catch (validationError) {
    // Validation failed - return a safe response without structuredContent
    // The MCP framework won't validate if structuredContent is undefined
    const errorMessage =
      validationError instanceof Error
        ? validationError.message
        : 'Unknown validation error';

    console.warn(
      `Output validation failed for tool ${toolName || 'unknown'}: ${errorMessage}`
    );

    // Create a text representation of the data
    const jsonText = JSON.stringify(result.structuredContent, null, 2);

    // Return without structuredContent to avoid MCP validation
    // But include the data as formatted text
    return {
      content: [
        {
          type: 'text',
          text:
            result.content?.[0]?.type === 'text'
              ? result.content[0].text
              : jsonText
        }
      ],
      // Omit structuredContent to prevent MCP validation errors
      // The data is still available in the text content
      isError: false
    };
  }
}
