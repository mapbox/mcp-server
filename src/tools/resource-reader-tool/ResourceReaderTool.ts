// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { BaseTool } from '../BaseTool.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ResourceReaderToolInput } from './ResourceReaderTool.input.schema.js';
import { ResourceReaderToolInputSchema } from './ResourceReaderTool.input.schema.js';
import { ResourceReaderToolOutputSchema } from './ResourceReaderTool.output.schema.js';
import { getResourceByUri } from '../../resources/resourceRegistry.js';

/**
 * Tool for reading MCP resources via the tool interface.
 * This provides a fallback mechanism for clients that don't support the MCP resource API.
 */
export class ResourceReaderTool extends BaseTool<
  typeof ResourceReaderToolInputSchema,
  typeof ResourceReaderToolOutputSchema
> {
  name = 'resource_reader_tool';
  description =
    'Reads an MCP resource by URI. This tool is a fallback for clients that do not support the native MCP resource API. Supports reading category lists and other Mapbox resources. Use "mapbox://categories" for default categories or "mapbox://categories/{language}" for localized versions (e.g., "mapbox://categories/ja" for Japanese).';
  annotations = {
    title: 'Resource Reader Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };

  constructor() {
    super({
      inputSchema: ResourceReaderToolInputSchema,
      outputSchema: ResourceReaderToolOutputSchema
    });
  }

  async run(
    rawInput: unknown,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extra?: RequestHandlerExtra<any, any>
  ): Promise<CallToolResult> {
    try {
      const input = this.inputSchema.parse(rawInput);

      const result = await this.execute(input, extra);
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.log(
        'error',
        `${this.name}: Error during execution: ${errorMessage}`
      );

      const errorResponse = {
        message: errorMessage,
        tool: this.name
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(errorResponse)
          }
        ],
        isError: true
      };
    }
  }

  private async execute(
    input: ResourceReaderToolInput,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extra?: RequestHandlerExtra<any, any>
  ): Promise<CallToolResult> {
    // Find the resource by URI
    const resource = getResourceByUri(input.uri);

    if (!resource) {
      const availableResources = await this.listAvailableResources();
      return {
        content: [
          {
            type: 'text',
            text: `Resource not found: ${input.uri}. Available resource URIs: ${availableResources}`
          }
        ],
        isError: true
      };
    }

    try {
      // Read the resource
      const result = await resource.read(input.uri, extra);

      // Return the first content item (resources can return multiple, but we'll return the first)
      const content = result.contents[0];

      if (!content) {
        return {
          content: [
            {
              type: 'text',
              text: `Resource returned no content: ${input.uri}`
            }
          ],
          isError: true
        };
      }

      // Validate output against schema
      try {
        ResourceReaderToolOutputSchema.parse(content);
      } catch (validationError) {
        this.log(
          'warning',
          `Output schema validation failed: ${validationError instanceof Error ? validationError.message : 'Unknown validation error'}`
        );
      }

      // Extract text or blob from the content using type guards
      let textContent: string;
      if ('text' in content && typeof content.text === 'string') {
        textContent = content.text;
      } else if ('blob' in content && typeof content.blob === 'string') {
        textContent = content.blob;
      } else {
        throw new Error('Resource content must contain either text or blob');
      }

      return {
        content: [
          {
            type: 'text',
            text: textContent
          }
        ],
        structuredContent: content,
        isError: false
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `Error reading resource ${input.uri}: ${errorMessage}`
          }
        ],
        isError: true
      };
    }
  }

  /**
   * Lists all available resource URIs for error messages
   */
  private async listAvailableResources(): Promise<string> {
    const { getAllResources } = await import(
      '../../resources/resourceRegistry.js'
    );
    const resources = getAllResources();
    return resources.map((r: { uri: string }) => r.uri).join(', ');
  }
}
