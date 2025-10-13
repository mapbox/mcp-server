// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { OutputSchema } from '../MapboxApiBasedTool.output.schema.js';
import type { HttpRequest } from '../../utils/types.js';
import type { CategoryListInput } from './CategoryListTool.input.schema.js';
import { CategoryListInputSchema } from './CategoryListTool.input.schema.js';
import { CategoryListResponseSchema } from './CategoryListTool.output.schema.js';

// Interface for the full API response from Mapbox
interface MapboxApiResponse {
  listItems: Array<{
    canonical_id: string;
    icon: string;
    name: string;
    version?: string;
    uuid?: string;
  }>;
  attribution: string;
  version: string;
}
import type { z } from 'zod';

// API Documentation: https://docs.mapbox.com/api/search/search-box/#list-categories

/**
 * Tool for retrieving the list of supported categories from Mapbox Search API
 */
export class CategoryListTool extends MapboxApiBasedTool<
  typeof CategoryListInputSchema,
  typeof CategoryListResponseSchema
> {
  name = 'category_list_tool';
  description =
    'Tool for retrieving the list of supported categories from Mapbox Search API. Use this when another function requires a list of categories. Returns all available category IDs by default. Only use pagination (limit/offset) if token usage optimization is required. If using pagination, make multiple calls to retrieve ALL categories before proceeding with other tasks to ensure complete data.';
  annotations = {
    title: 'Category List Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };

  constructor(params: { httpRequest: HttpRequest }) {
    super({
      inputSchema: CategoryListInputSchema,
      outputSchema: CategoryListResponseSchema,
      httpRequest: params.httpRequest
    });
  }

  protected async execute(
    input: CategoryListInput,
    accessToken: string
  ): Promise<z.infer<typeof OutputSchema>> {
    const url = new URL(
      'https://api.mapbox.com/search/searchbox/v1/list/category'
    );

    url.searchParams.set('access_token', accessToken);

    if (input.language) {
      url.searchParams.set('language', input.language);
    }

    const response = await this.httpRequest(url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': `@mapbox/mcp-server/${process.env.npm_package_version || 'dev'}`
      }
    });

    if (!response.ok) {
      return {
        content: [
          {
            type: 'text',
            text: `Mapbox API request failed: ${response.status} ${response.statusText}`
          }
        ],
        isError: true
      };
    }

    const rawData = await response.json();

    // Parse the API response (which has the full structure)
    const data = rawData as MapboxApiResponse;

    // Apply pagination - if no limit specified, return all
    const startIndex = input.offset || 0;
    let endIndex = data.listItems.length;

    if (input.limit) {
      endIndex = Math.min(startIndex + input.limit, data.listItems.length);
    }

    // Extract just the category IDs for our simplified response
    const categoryIds = data.listItems
      .slice(startIndex, endIndex)
      .map((item) => item.canonical_id);

    const result = { listItems: categoryIds };

    // Validate our simplified output against the schema
    try {
      CategoryListResponseSchema.parse(result);
    } catch (validationError) {
      this.log(
        'warning',
        `Output schema validation failed: ${validationError instanceof Error ? validationError.message : 'Unknown validation error'}`
      );
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
      isError: false
    };
  }
}
