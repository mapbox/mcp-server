import { BaseResource } from './BaseResource.js';
import { MapboxCategoriesResource } from './mapbox-categories-resource/MapboxCategoriesResource.js';

/**
 * Registry of all available resources
 */
const resources: BaseResource[] = [new MapboxCategoriesResource()];

/**
 * Get all registered resources
 */
export function getAllResources(): BaseResource[] {
  return resources;
}
