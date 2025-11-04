// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { z } from 'zod';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { HttpRequest } from '../../utils/types.js';
import { FeedbackListInputSchema } from './FeedbackListTool.input.schema.js';
import { FeedbackListResponseSchema } from '../feedback.schema.js';
import type { FeedbackItem, FeedbackListResponse } from '../feedback.schema.js';

// API Documentation: https://docs.mapbox.com/api/feedback/

export class FeedbackListTool extends MapboxApiBasedTool<
  typeof FeedbackListInputSchema
> {
  name = 'feedback_list_tool';
  description =
    'List user feedback items from the Mapbox Feedback API with filtering, sorting, and pagination. Use this tool to access user-reported issues, suggestions, and feedback about map data, routing, and POI details. Supports comprehensive filtering by status, category, date ranges, trace IDs, and search text. Requires user-feedback:read scope on the access token.';
  annotations = {
    title: 'Feedback List Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };

  constructor(params: { httpRequest: HttpRequest }) {
    super({
      inputSchema: FeedbackListInputSchema,
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
    if (item.location.place_name) {
      result += `Location: ${item.location.place_name} (${item.location.lat}, ${item.location.lon})\n`;
    } else {
      result += `Location: ${item.location.lat}, ${item.location.lon}\n`;
    }
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
    input: z.infer<typeof FeedbackListInputSchema>,
    accessToken: string,
    context: unknown
  ): Promise<CallToolResult> {
    // Context parameter is required by base class signature but not used in this implementation
    void context;

    const url = new URL(
      `${MapboxApiBasedTool.mapboxApiEndpoint}user-feedback/v1/feedback`
    );
    url.searchParams.append('access_token', accessToken);
    this.buildListParams(input, url);

    // Make the request
    const response = await this.httpRequest(url.toString());

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to list feedback: ${response.status} ${response.statusText}. ${errorText}`
          }
        ],
        isError: true
      };
    }

    const rawData = await response.json();

    // Validate and format response
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
