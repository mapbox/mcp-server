// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

// INSERT NEW RESOURCE IMPORT HERE
import { CategoryListResource } from './category-list/CategoryListResource.js';
import { TemporaryDataResource } from './temporary/TemporaryDataResource.js';
import { StaticMapUIResource } from './ui-apps/StaticMapUIResource.js';
import { DirectionsAppUIResource } from './ui-apps/DirectionsAppUIResource.js';
import {
  MapAppUIResource,
  MAP_APP_FLAVORS
} from './ui-apps/MapAppUIResource.js';
import { VersionResource } from './version/VersionResource.js';
import { httpRequest } from '../utils/httpPipeline.js';

// Central registry of all resources
export const ALL_RESOURCES = [
  // INSERT NEW RESOURCE INSTANCE HERE
  new CategoryListResource({ httpRequest }),
  new TemporaryDataResource(),
  new StaticMapUIResource(),
  new DirectionsAppUIResource({ httpRequest }),
  // One MapAppUIResource flavor per tool — same HTML, different URIs so the
  // host doesn't dedupe iframes when an LLM chains multiple map-rendering
  // tools in one chat.
  ...MAP_APP_FLAVORS.map(
    (flavor) => new MapAppUIResource({ httpRequest, flavor })
  ),
  new VersionResource()
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
