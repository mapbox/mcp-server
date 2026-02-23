// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

// INSERT NEW RESOURCE IMPORT HERE
import { CategoryListResource } from './category-list/CategoryListResource.js';
import { TemporaryDataResource } from './temporary/TemporaryDataResource.js';
import { StaticMapUIResource } from './ui-apps/StaticMapUIResource.js';
import { httpRequest } from '../utils/httpPipeline.js';

// Central registry of all resources
export const ALL_RESOURCES = [
  // INSERT NEW RESOURCE INSTANCE HERE
  new CategoryListResource({ httpRequest }),
  new TemporaryDataResource(),
  new StaticMapUIResource()
] as const;

export type ResourceInstance = (typeof ALL_RESOURCES)[number];

export function getAllResources(): readonly ResourceInstance[] {
  return ALL_RESOURCES;
}

export function getResourceByUri(uri: string): ResourceInstance | undefined {
  // Find exact match first
  const exactMatch = ALL_RESOURCES.find((resource) => resource.uri === uri);
  if (exactMatch) return exactMatch;

  // Find pattern match (e.g., mapbox://categories/ja matches mapbox://categories)
  return ALL_RESOURCES.find((resource) => {
    // Check if the URI starts with the resource's base URI
    const basePattern = resource.uri.replace(/\*/g, '.*');
    const regex = new RegExp(`^${basePattern}`);
    return regex.test(uri);
  });
}
