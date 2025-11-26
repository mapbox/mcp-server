// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

// INSERT NEW RESOURCE IMPORT HERE
import { CategoryListResource } from './category-list/CategoryListResource.js';
import { WidgetTemplatesResource } from './widget-templates/WidgetTemplatesResource.js';
import { httpRequest } from '../utils/httpPipeline.js';
import { isChatGptWidgetsEnabled } from '../widgets/widgetUtils.js';

// Central registry of all resources
const BASE_RESOURCES = [
  // INSERT NEW RESOURCE INSTANCE HERE
  new CategoryListResource({ httpRequest })
] as const;

// Cache for lazy-loaded resources
let cachedResources:
  | readonly (CategoryListResource | WidgetTemplatesResource)[]
  | null = null;

export type ResourceInstance = CategoryListResource | WidgetTemplatesResource;

/**
 * Get all resources, lazily evaluating widget support.
 * This must be called AFTER .env is loaded to properly detect ENABLE_CHATGPT_WIDGETS.
 */
export function getAllResources(): readonly ResourceInstance[] {
  if (cachedResources === null) {
    // Evaluate widget support at call time, not module load time
    cachedResources = isChatGptWidgetsEnabled()
      ? [...BASE_RESOURCES, new WidgetTemplatesResource()]
      : BASE_RESOURCES;
  }
  return cachedResources;
}

export function getResourceByUri(uri: string): ResourceInstance | undefined {
  const resources = getAllResources();
  // Find exact match first
  const exactMatch = resources.find((resource) => resource.uri === uri);
  if (exactMatch) return exactMatch;

  // Find pattern match (e.g., mapbox://categories/ja matches mapbox://categories)
  return resources.find((resource) => {
    // Check if the URI starts with the resource's base URI
    const basePattern = resource.uri.replace(/\*/g, '.*');
    const regex = new RegExp(`^${basePattern}`);
    return regex.test(uri);
  });
}
