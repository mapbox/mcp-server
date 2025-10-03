// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import { fetchClient } from '../../utils/fetchRequest.js';
import type { CategoryListInput } from './CategoryListTool.schema.js';
import { CategoryListInputSchema } from './CategoryListTool.schema.js';

interface CategoryListResponse {
  listItems: Array<{
    canonical_id: string;
    icon: string;
    name: string;
    version?: string;
    uuid?: string;
  }>;
  version: string;
}

/**
 * Tool for retrieving the list of supported categories from Mapbox Search API
 */
export class CategoryListTool extends MapboxApiBasedTool<
  typeof CategoryListInputSchema
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

  constructor(private fetchImpl: typeof fetch = fetchClient) {
    super({ inputSchema: CategoryListInputSchema });
  }

  protected async execute(
    input: CategoryListInput,
    accessToken: string
  ): Promise<{
    content: Array<{ type: 'text'; text: string }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  }> {
    const url = new URL(
      'https://api.mapbox.com/search/searchbox/v1/list/category'
    );

    url.searchParams.set('access_token', accessToken);

    if (input.language) {
      url.searchParams.set('language', input.language);
    }

    const response = await this.fetchImpl(url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': `@mapbox/mcp-server/${process.env.npm_package_version || 'dev'}`
      }
    });

    if (!response.ok) {
      throw new Error(
        `Mapbox API request failed: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as CategoryListResponse;

    // Apply pagination - if no limit specified, return all
    const startIndex = input.offset || 0;
    let endIndex = data.listItems.length;

    if (input.limit) {
      endIndex = Math.min(startIndex + input.limit, data.listItems.length);
    }

    // Return simple object with listItems array
    const categoryIds = data.listItems
      .slice(startIndex, endIndex)
      .map((item) => item.canonical_id);

    const resultData = {
      listItems: categoryIds
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(resultData, null, 2) }],
      structuredContent: resultData as Record<string, unknown>,
      isError: false
    };
  }
}
