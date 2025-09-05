import { MAPBOX_SUPPORTED_CATEGORIES } from '../../constants/mapboxCategories.js';
import { BaseResource } from '../BaseResource.js';

/**
 * Resource providing the complete list of supported Mapbox search categories
 */
export class MapboxCategoriesResource extends BaseResource {
  readonly name = 'Mapbox Search Categories';
  readonly uri = 'resource://mapbox-categories';
  readonly description =
    'Complete list of supported categories for Mapbox Category Search Tool';
  readonly mimeType = 'text/plain';

  protected async readCallback(uri: URL, extra: any) {
    // Generate simple list of categories
    const categoryList = MAPBOX_SUPPORTED_CATEGORIES.map(
      (cat) => `- ${cat}`
    ).join('\n');

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: this.mimeType,
          text: categoryList
        }
      ]
    };
  }
}
