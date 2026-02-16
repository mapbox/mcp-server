// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * @module resources
 *
 * Public API for Mapbox MCP resources. This module exports:
 * - Resource classes for custom instantiation
 * - Pre-configured resource instances ready to use
 * - Registry functions for batch access
 *
 * @example Simple usage with pre-configured instances
 * ```typescript
 * import { categoryList } from '@mapbox/mcp-server/resources';
 *
 * // Use directly - httpRequest already configured
 * const result = await categoryList.read();
 * ```
 *
 * @example Advanced usage with custom pipeline
 * ```typescript
 * import { CategoryListResource } from '@mapbox/mcp-server/resources';
 * import { httpRequest } from '@mapbox/mcp-server/utils';
 *
 * const customResource = new CategoryListResource({ httpRequest });
 * ```
 */

import { httpRequest } from '../utils/httpPipeline.js';

// Export all resource classes
export { CategoryListResource } from './category-list/CategoryListResource.js';

// Import resource classes for instantiation
import { CategoryListResource } from './category-list/CategoryListResource.js';

// Export pre-configured resource instances with short, clean names
/** Category list for place search (mapbox://categories) */
export const categoryList = new CategoryListResource({ httpRequest });

// Export registry functions for batch access
export {
  getAllResources,
  getResourceByUri,
  type ResourceInstance
} from './resourceRegistry.js';
