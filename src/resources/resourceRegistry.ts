// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

// INSERT NEW RESOURCE IMPORT HERE
import { CategoryListResource } from './category-list/CategoryListResource.js';
import { TemporaryDataResource } from './temporary/TemporaryDataResource.js';
import { ComputeResource } from './compute/ComputeResource.js';
import { InlinePayloadResource } from './inline-payload/InlinePayloadResource.js';
import { MapAppUIResource } from './ui-apps/MapAppUIResource.js';
import { VersionResource } from './version/VersionResource.js';
import { httpRequest } from '../utils/httpPipeline.js';

// Central registry of all resources
export const ALL_RESOURCES = [
  // INSERT NEW RESOURCE INSTANCE HERE
  new CategoryListResource({ httpRequest }),
  new TemporaryDataResource(),
  new ComputeResource(),
  new InlinePayloadResource(),
  // Single shared map renderer, targeted exclusively by render_map_tool.
  new MapAppUIResource({ httpRequest }),
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
  // Plain string prefix check — avoids building a RegExp from data at runtime,
  // which would let an unbounded, user-supplied `uri` be tested against a
  // dynamically constructed pattern (untrusted-input-into-RegExp is a ReDoS
  // smell even though today's static resource URIs are innocuous).
  return ALL_RESOURCES.find((resource) => {
    const wildcardIndex = resource.uri.indexOf('*');
    const basePrefix =
      wildcardIndex === -1
        ? resource.uri
        : resource.uri.slice(0, wildcardIndex);
    return uri.startsWith(basePrefix);
  });
}
