// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

// INSERT NEW TOOL IMPORT HERE
import { PlaceDetailsTool } from './place-details-tool/PlaceDetailsTool.js';
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
 */
export const CORE_TOOLS = [
  // INSERT NEW TOOL INSTANCE HERE
  new PlaceDetailsTool({ httpRequest }),
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
 * Tools that require elicitation capability for optimal functionality
 * These tools use elicitInput() for secure token management
 * Registered only if client supports elicitation
 *
 * Currently empty - elicitation support will be added in a future PR.
 * This category is ready for tools that require the elicitation capability.
 */
export const ELICITATION_TOOLS = [] as const;

/**
 * Tools that serve as bridges for clients without resource support
 * These tools are only registered if CLIENT_NEEDS_RESOURCE_FALLBACK env var is set to "true"
 *
 * Context: Most MCP clients support resources (Claude Desktop, VS Code, Inspector, etc.).
 * However, some clients (like smolagents) don't support resources at all.
 * These tools provide the same content as resources but via tool calls instead.
 *
 * Configuration:
 * - Leave unset (default) = Skip these tools (assumes client supports resources)
 * - Set CLIENT_NEEDS_RESOURCE_FALLBACK=true = Include these tools (for smolagents, etc.)
 *
 * Tools:
 * - ResourceReaderTool: Generic fallback for reading any resource by URI
 * - CategoryListTool: Provides access to category list (mapbox://categories)
 */
export const RESOURCE_FALLBACK_TOOLS = [
  new ResourceReaderTool(),
  new CategoryListTool({ httpRequest })
] as const;

/**
 * All tools combined (for backward compatibility and testing)
 */
export const ALL_TOOLS = [
  ...CORE_TOOLS,
  ...ELICITATION_TOOLS,
  ...RESOURCE_FALLBACK_TOOLS
] as const;

export type ToolInstance = (typeof ALL_TOOLS)[number];

/**
 * Get all tools (for backward compatibility)
 * @deprecated Use getCoreTools(), getElicitationTools(), etc. instead for capability-aware registration
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

/**
 * Get tools that require elicitation capability
 */
export function getElicitationTools(): readonly ToolInstance[] {
  return ELICITATION_TOOLS;
}

/**
 * Get tools that serve as fallbacks when client doesn't support resources
 */
export function getResourceFallbackTools(): readonly ToolInstance[] {
  return RESOURCE_FALLBACK_TOOLS;
}

export function getToolByName(name: string): ToolInstance | undefined {
  return ALL_TOOLS.find((tool) => tool.name === name);
}
