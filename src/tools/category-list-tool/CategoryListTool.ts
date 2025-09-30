import { z } from 'zod';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import { fetchClient } from '../../utils/fetchRequest.js';

const CategoryListInputSchema = z.object({
  language: z
    .string()
    .optional()
    .describe(
      'ISO language code for the response (e.g., "en", "es", "fr", "de", "ja"). If not provided, English (en) will be used as the default.'
    ),
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe(
      'Number of categories to return (1-100). WARNING: Only use this parameter if you need to optimize token usage. If using pagination, please make multiple calls to retrieve all categories before proceeding with other tasks. If not specified, returns all categories.'
    ),
  offset: z
    .number()
    .min(0)
    .optional()
    .default(0)
    .describe('Number of categories to skip for pagination. Default is 0.')
});

type CategoryListInput = z.infer<typeof CategoryListInputSchema>;

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
  ): Promise<any> {
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

    return {
      listItems: categoryIds
    };
  }
}
