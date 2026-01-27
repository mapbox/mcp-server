// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

// INSERT NEW TOOL IMPORT HERE
import { SimplifyTool } from './simplify-tool/SimplifyTool.js';
import { BoundingBoxTool } from './bounding-box-tool/BoundingBoxTool.js';
import { CentroidTool } from './centroid-tool/CentroidTool.js';
import { MidpointTool } from './midpoint-tool/MidpointTool.js';
import { BearingTool } from './bearing-tool/BearingTool.js';
import { AreaTool } from './area-tool/AreaTool.js';
import { BufferTool } from './buffer-tool/BufferTool.js';
import { PointInPolygonTool } from './point-in-polygon-tool/PointInPolygonTool.js';
import { DistanceTool } from './distance-tool/DistanceTool.js';
import { CategoryListTool } from './category-list-tool/CategoryListTool.js';
import { CategorySearchTool } from './category-search-tool/CategorySearchTool.js';
import { DirectionsTool } from './directions-tool/DirectionsTool.js';
import { IsochroneTool } from './isochrone-tool/IsochroneTool.js';
import { MapMatchingTool } from './map-matching-tool/MapMatchingTool.js';
import { MatrixTool } from './matrix-tool/MatrixTool.js';
import { OptimizationTool } from './optimization-tool/OptimizationTool.js';
import { ResourceReaderTool } from './resource-reader-tool/ResourceReaderTool.js';
import { ReverseGeocodeTool } from './reverse-geocode-tool/ReverseGeocodeTool.js';
import { StaticMapImageTool } from './static-map-image-tool/StaticMapImageTool.js';
import { SearchAndGeocodeTool } from './search-and-geocode-tool/SearchAndGeocodeTool.js';
import { VersionTool } from './version-tool/VersionTool.js';
import { httpRequest } from '../utils/httpPipeline.js';

/**
 * Core tools that work in all MCP clients without requiring special capabilities
 * These tools are registered immediately during server startup
 *
 * Note: ResourceReaderTool is included here since we cannot reliably detect
 * whether a client needs it. It's a useful fallback for clients that can list
 * resources but don't automatically fetch them (like Claude Desktop).
 */
export const CORE_TOOLS = [
  // INSERT NEW TOOL INSTANCE HERE
  new SimplifyTool(),
  new BoundingBoxTool(),
  new CentroidTool(),
  new MidpointTool(),
  new BearingTool(),
  new AreaTool(),
  new BufferTool(),
  new PointInPolygonTool(),
  new DistanceTool(),
  new VersionTool(),
  new ResourceReaderTool(),
  new CategoryListTool({ httpRequest }),
  new CategorySearchTool({ httpRequest }),
  new DirectionsTool({ httpRequest }),
  new IsochroneTool({ httpRequest }),
  new MapMatchingTool({ httpRequest }),
  new MatrixTool({ httpRequest }),
  new OptimizationTool({ httpRequest }),
  new ReverseGeocodeTool({ httpRequest }),
  new StaticMapImageTool({ httpRequest }),
  new SearchAndGeocodeTool({ httpRequest })
] as const;

/**
 * All tools combined (for backward compatibility and testing)
 */
export const ALL_TOOLS = [...CORE_TOOLS] as const;

export type ToolInstance = (typeof ALL_TOOLS)[number];

/**
 * Get all tools (for backward compatibility)
 * @deprecated Use getCoreTools() instead for capability-aware registration
 */
export function getAllTools(): readonly ToolInstance[] {
  return ALL_TOOLS;
}

/**
 * Get tools that work in all MCP clients
 */
export function getCoreTools(): readonly ToolInstance[] {
  return CORE_TOOLS;
}

export function getToolByName(name: string): ToolInstance | undefined {
  return ALL_TOOLS.find((tool) => tool.name === name);
}
