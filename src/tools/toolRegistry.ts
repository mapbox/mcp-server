// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

// INSERT NEW TOOL IMPORT HERE
import { CategoryListTool } from './category-list-tool/CategoryListTool.js';
import { CategorySearchTool } from './category-search-tool/CategorySearchTool.js';
import { DirectionsTool } from './directions-tool/DirectionsTool.js';
import { FeedbackTool } from './feedback-tool/FeedbackTool.js';
import { IsochroneTool } from './isochrone-tool/IsochroneTool.js';
import { MatrixTool } from './matrix-tool/MatrixTool.js';
import { ReverseGeocodeTool } from './reverse-geocode-tool/ReverseGeocodeTool.js';
import { StaticMapImageTool } from './static-map-image-tool/StaticMapImageTool.js';
import { SearchAndGeocodeTool } from './search-and-geocode-tool/SearchAndGeocodeTool.js';
import { VersionTool } from './version-tool/VersionTool.js';
import { httpRequest } from '../utils/httpPipeline.js';

// Central registry of all tools
export const ALL_TOOLS = [
  // INSERT NEW TOOL INSTANCE HERE
  new VersionTool(),
  new CategoryListTool({ httpRequest }),
  new CategorySearchTool({ httpRequest }),
  new DirectionsTool({ httpRequest }),
  new FeedbackTool({ httpRequest }),
  new IsochroneTool({ httpRequest }),
  new MatrixTool({ httpRequest }),
  new ReverseGeocodeTool({ httpRequest }),
  new StaticMapImageTool({ httpRequest }),
  new SearchAndGeocodeTool({ httpRequest })
] as const;

export type ToolInstance = (typeof ALL_TOOLS)[number];

export function getAllTools(): readonly ToolInstance[] {
  return ALL_TOOLS;
}

export function getToolByName(name: string): ToolInstance | undefined {
  return ALL_TOOLS.find((tool) => tool.name === name);
}
