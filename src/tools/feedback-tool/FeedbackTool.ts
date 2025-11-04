// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { z } from 'zod';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { HttpRequest } from '../../utils/types.js';
import { FeedbackInputSchema } from './FeedbackTool.input.schema.js';
import type { FeedbackListInputSchema } from './FeedbackTool.input.schema.js';
import {
  FeedbackListResponseSchema,
  FeedbackGetResponseSchema
} from './FeedbackTool.output.schema.js';
import type {
  FeedbackItem,
  FeedbackListResponse
} from './FeedbackTool.output.schema.js';

// API Documentation: https://docs.mapbox.com/api/feedback/

export class FeedbackTool extends MapboxApiBasedTool<
  typeof FeedbackInputSchema
> {
  name = 'feedback_tool';
  description =
    'Retrieve user feedback items from the Mapbox Feedback API. Supports listing feedback items with filtering, sorting, and pagination, or getting a single feedback item by ID. Use this tool to access user-reported issues, suggestions, and feedback about map data, routing, and POI details. Requires user-feedback:read scope on the access token.';
  annotations = {
    title: 'Feedback Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };

  constructor(params: { httpRequest: HttpRequest }) {
    super({
      inputSchema: FeedbackInputSchema,
      httpRequest: params.httpRequest
    });
  }

  /**
   * Formats a feedback item for human-readable text output
   */
  private formatFeedbackItem(item: FeedbackItem, index?: number): string {
    let result = '';
    if (index !== undefined) {
      result += `${index + 1}. `;
    }
    result += `Feedback ID: ${item.id}\n`;
    result += `Status: ${item.status}\n`;
    result += `Category: ${item.category}\n`;
    result += `Feedback: ${item.feedback}\n`;
    result += `Location: ${item.location.place_name} (${item.location.lat}, ${item.location.lon})\n`;
    if (item.trace_id) {
      result += `Trace ID: ${item.trace_id}\n`;
    }
    result += `Created: ${item.created_at}\n`;
    result += `Received: ${item.received_at}\n`;
    result += `Updated: ${item.updated_at}`;
    return result;
  }

  /**
   * Formats a list response for human-readable text output
   */
  private formatListResponse(response: FeedbackListResponse): string {
    if (!response.items || response.items.length === 0) {
      return 'No feedback items found matching the specified criteria.';
    }

    const items = response.items.map((item, index) =>
      this.formatFeedbackItem(item, index)
    );

    let result = `Found ${response.items.length} feedback item(s):\n\n`;
    result += items.join('\n\n');

    if (response.has_after || response.has_before) {
      result += '\n\n--- Pagination ---\n';
      if (response.has_before && response.start_cursor) {
        result += `Has previous page (use start_cursor: ${response.start_cursor})\n`;
      }
      if (response.has_after && response.end_cursor) {
        result += `Has next page (use end_cursor: ${response.end_cursor} with 'after' parameter)\n`;
      }
    }

    return result;
  }

  /**
   * Formats a single feedback item for human-readable text output
   */
  private formatGetResponse(item: FeedbackItem): string {
    return this.formatFeedbackItem(item);
  }

  /**
   * Builds URL parameters for list operation
   */
  private buildListParams(
    input: z.infer<typeof FeedbackListInputSchema>,
    url: URL
  ): void {
    // Add optional parameters
    if (input.feedback_ids && input.feedback_ids.length > 0) {
      input.feedback_ids.forEach((id) => {
        url.searchParams.append('feedback_id', id);
      });
    }

    if (input.after) {
      url.searchParams.append('after', input.after);
    }

    if (input.limit !== undefined) {
      url.searchParams.append('limit', input.limit.toString());
    }

    if (input.sort_by) {
      url.searchParams.append('sort_by', input.sort_by);
    }

    if (input.order) {
      url.searchParams.append('order', input.order);
    }

    if (input.status && input.status.length > 0) {
      input.status.forEach((s) => {
        url.searchParams.append('status', s);
      });
    }

    if (input.category && input.category.length > 0) {
      input.category.forEach((c) => {
        url.searchParams.append('category', c);
      });
    }

    if (input.search) {
      url.searchParams.append('search', input.search);
    }

    if (input.trace_id && input.trace_id.length > 0) {
      input.trace_id.forEach((t) => {
        url.searchParams.append('trace_id', t);
      });
    }

    if (input.created_before) {
      url.searchParams.append('created_before', input.created_before);
    }

    if (input.created_after) {
      url.searchParams.append('created_after', input.created_after);
    }

    if (input.received_before) {
      url.searchParams.append('received_before', input.received_before);
    }

    if (input.received_after) {
      url.searchParams.append('received_after', input.received_after);
    }

    if (input.updated_before) {
      url.searchParams.append('updated_before', input.updated_before);
    }

    if (input.updated_after) {
      url.searchParams.append('updated_after', input.updated_after);
    }
  }

  protected async execute(
    input: z.infer<typeof FeedbackInputSchema>,
    accessToken: string,
    context: unknown
  ): Promise<CallToolResult> {
    // Context parameter is required by base class signature but not used in this implementation
    // It will be used when submit operation is added in the future
    void context;
    let url: URL;

    if (input.operation === 'get') {
      // Get single feedback item
      // With discriminated union, TypeScript guarantees feedback_id is present
      url = new URL(
        `${MapboxApiBasedTool.mapboxApiEndpoint}user-feedback/v1/feedback/${input.feedback_id}`
      );
      url.searchParams.append('access_token', accessToken);
    } else if (input.operation === 'list') {
      // List feedback items
      url = new URL(
        `${MapboxApiBasedTool.mapboxApiEndpoint}user-feedback/v1/feedback`
      );
      url.searchParams.append('access_token', accessToken);
      this.buildListParams(input, url);
    } else {
      // This should never happen with discriminated union, but TypeScript needs it
      return {
        content: [
          {
            type: 'text',
            text: `Error: Unknown operation: ${(input as { operation: string }).operation}`
          }
        ],
        isError: true
      };
    }

    // Make the request
    const response = await this.httpRequest(url.toString());

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to ${input.operation} feedback: ${response.status} ${response.statusText}. ${errorText}`
          }
        ],
        isError: true
      };
    }

    const rawData = await response.json();

    // Validate and format response
    if (input.operation === 'get') {
      // Single item response
      let data;
      try {
        data = FeedbackGetResponseSchema.parse(rawData);
      } catch (validationError) {
        this.log(
          'warning',
          `Schema validation failed for feedback get response: ${validationError instanceof Error ? validationError.message : 'Unknown validation error'}`
        );
        data = rawData;
      }

      if (input.format === 'json_string') {
        return {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
          structuredContent: data as unknown as Record<string, unknown>,
          isError: false
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: this.formatGetResponse(data as FeedbackItem)
            }
          ],
          structuredContent: data as unknown as Record<string, unknown>,
          isError: false
        };
      }
    } else {
      // List response
      let data: FeedbackListResponse;
      try {
        data = FeedbackListResponseSchema.parse(rawData);
      } catch (validationError) {
        this.log(
          'warning',
          `Schema validation failed for feedback list response: ${validationError instanceof Error ? validationError.message : 'Unknown validation error'}`
        );
        data = rawData as FeedbackListResponse;
      }

      if (input.format === 'json_string') {
        return {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
          structuredContent: data as unknown as Record<string, unknown>,
          isError: false
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: this.formatListResponse(data)
            }
          ],
          structuredContent: data as unknown as Record<string, unknown>,
          isError: false
        };
      }
    }
  }
}
