// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * @module prompts
 *
 * Public API for Mapbox MCP prompts. This module exports:
 * - Prompt classes for custom instantiation
 * - Pre-configured prompt instances ready to use
 * - Registry functions for batch access
 *
 * @example Simple usage with pre-configured instances
 * ```typescript
 * import { getDirections } from '@mapbox/mcp-server/prompts';
 *
 * // Use directly
 * const result = await getDirections.execute({ ... });
 * ```
 *
 * @example Advanced usage with custom instantiation
 * ```typescript
 * import { GetDirectionsPrompt } from '@mapbox/mcp-server/prompts';
 *
 * const customPrompt = new GetDirectionsPrompt();
 * ```
 */

// Export all prompt classes
export { FindPlacesNearbyPrompt } from './FindPlacesNearbyPrompt.js';
export { GetDirectionsPrompt } from './GetDirectionsPrompt.js';
export { SearchAlongRoutePrompt } from './SearchAlongRoutePrompt.js';
export { ShowReachableAreasPrompt } from './ShowReachableAreasPrompt.js';

// Import prompt classes for instantiation
import { FindPlacesNearbyPrompt } from './FindPlacesNearbyPrompt.js';
import { GetDirectionsPrompt } from './GetDirectionsPrompt.js';
import { SearchAlongRoutePrompt } from './SearchAlongRoutePrompt.js';
import { ShowReachableAreasPrompt } from './ShowReachableAreasPrompt.js';

// Export pre-configured prompt instances with short, clean names
/** Find places near a location */
export const findPlacesNearby = new FindPlacesNearbyPrompt();

/** Get directions between locations */
export const getDirections = new GetDirectionsPrompt();

/** Search for points of interest along a route */
export const searchAlongRoute = new SearchAlongRoutePrompt();

/** Show areas reachable within a time limit */
export const showReachableAreas = new ShowReachableAreasPrompt();

// Export registry functions for batch access
export {
  getAllPrompts,
  getPromptByName,
  type PromptInstance
} from './promptRegistry.js';
