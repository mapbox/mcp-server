// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { BaseTool } from '../BaseTool.js';
import type {
  CallToolResult,
  ServerContext
} from '@modelcontextprotocol/server';
import type { ResourceReaderToolInput } from './ResourceReaderTool.input.schema.js';
import { ResourceReaderToolInputSchema } from './ResourceReaderTool.input.schema.js';
import { ResourceReaderToolOutputSchema } from './ResourceReaderTool.output.schema.js';
import { getResourceByUri } from '../../resources/resourceRegistry.js';
import { isSelfFetchRef } from '../../utils/selfFetchRef.js';

// Base64 grows a blob by about a third, so this keeps an image result under
// Claude Desktop's 1 MB tool-result cap (same limit as static_map_image_tool).
const BLOB_INLINE_LIMIT = 700 * 1024;

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
    'Reads an MCP resource by URI. This tool is a fallback for clients that do not support the native MCP resource API. Supports reading category lists and the mapbox:// refs other tools return (mapbox://temp/..., mapbox://response/..., mapbox://inline/..., mapbox://compute/...); pass a ref exactly as returned. mapbox://selffetch/... refs are not readable: pass them to render_map_tool in payload_refs, which fetches the data itself. Use "mapbox://categories" for default categories or "mapbox://categories/{language}" for localized versions (e.g., "mapbox://categories/ja" for Japanese).';
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

    extra?: ServerContext
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

    extra?: ServerContext
  ): Promise<CallToolResult> {
    if (isSelfFetchRef(input.uri)) {
      return {
        content: [
          {
            type: 'text',
            text: `${input.uri} is not a readable resource. Pass it unchanged to render_map_tool in payload_refs; the map fetches its data itself.`
          }
        ],
        isError: true
      };
    }

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

      // A blob goes back once, not as base64 text plus a copy in
      // structuredContent: an image the host can show, or a short note when
      // it's too big to send (or isn't an image).
      if ('blob' in content && typeof content.blob === 'string') {
        const mimeType = content.mimeType ?? 'application/octet-stream';
        const bytes = Math.floor((content.blob.length * 3) / 4);
        const structuredContent = { uri: content.uri, mimeType };
        if (
          (mimeType === 'image/png' || mimeType === 'image/jpeg') &&
          bytes <= BLOB_INLINE_LIMIT
        ) {
          return {
            content: [{ type: 'image', data: content.blob, mimeType }],
            structuredContent,
            isError: false
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: `${input.uri} holds ${mimeType} data (${Math.round(bytes / 1024)} KB), too large to return through this tool. For a static map, give the user the image link from static_map_image_tool's result, or call it again with a smaller size.`
            }
          ],
          structuredContent,
          isError: false
        };
      }
      if (!('text' in content) || typeof content.text !== 'string') {
        throw new Error('Resource content must contain either text or blob');
      }
      const textContent = content.text;

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
    const { getAllResources } =
      await import('../../resources/resourceRegistry.js');
    const resources = getAllResources();
    return resources.map((r: { uri: string }) => r.uri).join(', ');
  }
}
