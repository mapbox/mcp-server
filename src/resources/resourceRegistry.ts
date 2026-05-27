// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

// INSERT NEW RESOURCE IMPORT HERE
import { CategoryListResource } from './category-list/CategoryListResource.js';
import { TemporaryDataResource } from './temporary/TemporaryDataResource.js';
import { StaticMapUIResource } from './ui-apps/StaticMapUIResource.js';
import { DirectionsAppUIResource } from './ui-apps/DirectionsAppUIResource.js';
import { IsochroneAppUIResource } from './ui-apps/IsochroneAppUIResource.js';
import { OptimizationAppUIResource } from './ui-apps/OptimizationAppUIResource.js';
import { SearchAppUIResource } from './ui-apps/SearchAppUIResource.js';
import { MapMatchingAppUIResource } from './ui-apps/MapMatchingAppUIResource.js';
import { GroundLocationAppUIResource } from './ui-apps/GroundLocationAppUIResource.js';
import { VersionResource } from './version/VersionResource.js';
import { httpRequest } from '../utils/httpPipeline.js';

// Central registry of all resources
export const ALL_RESOURCES = [
  // INSERT NEW RESOURCE INSTANCE HERE
  new CategoryListResource({ httpRequest }),
  new TemporaryDataResource(),
  new StaticMapUIResource(),
  new DirectionsAppUIResource({ httpRequest }),
  new IsochroneAppUIResource({ httpRequest }),
  new OptimizationAppUIResource({ httpRequest }),
  new SearchAppUIResource({ httpRequest }),
  new MapMatchingAppUIResource({ httpRequest }),
  new GroundLocationAppUIResource({ httpRequest }),
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
