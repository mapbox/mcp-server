// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { MapboxApiBasedResource } from '../MapboxApiBasedResource.js';
import type { HttpRequest } from '../../utils/types.js';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';

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

// API Documentation: https://docs.mapbox.com/api/search/search-box/#list-categories

/**
 * Resource for retrieving the list of supported categories from Mapbox Search API
 *
 * Available URIs:
 * - mapbox://categories - Default (English)
 * - mapbox://categories/{language} - Localized (e.g., mapbox://categories/ja)
 */
export class CategoryListResource extends MapboxApiBasedResource {
  readonly uri = 'mapbox://categories';
  readonly name = 'Mapbox Categories';
  readonly description =
    'List of all available Mapbox Search API categories. Categories can be used for filtering search results. Supports localization via language parameter in URI (e.g., mapbox://categories/ja for Japanese).';
  readonly mimeType = 'application/json';

  constructor(params: { httpRequest: HttpRequest }) {
    super(params);
  }

  protected async execute(
    uri: string,
    accessToken: string
  ): Promise<ReadResourceResult> {
    // Parse language from URI if present
    // Format: mapbox://categories or mapbox://categories/ja
    const language = this.extractLanguageFromUri(uri);

    const apiUrl = new URL(
      'https://api.mapbox.com/search/searchbox/v1/list/category'
    );

    apiUrl.searchParams.set('access_token', accessToken);

    if (language) {
      apiUrl.searchParams.set('language', language);
    }

    const response = await this.httpRequest(apiUrl.toString(), {
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

    const rawData = await response.json();
    const data = rawData as MapboxApiResponse;

    // Extract just the category IDs for a simplified response
    const categoryIds = data.listItems.map((item) => item.canonical_id);

    const result = {
      listItems: categoryIds,
      version: data.version,
      attribution: data.attribution
    };

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }

  /**
   * Extract language code from URI
   * @param uri Resource URI (e.g., mapbox://categories/ja)
   * @returns Language code or undefined if not present
   */
  private extractLanguageFromUri(uri: string): string | undefined {
    const match = uri.match(/^mapbox:\/\/categories\/([a-z]{2})$/i);
    return match?.[1];
  }
}
