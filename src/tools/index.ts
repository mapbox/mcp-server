// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * @module tools
 *
 * Public API for Mapbox MCP tools. This module exports:
 * - Tool classes for custom instantiation
 * - Pre-configured tool instances ready to use
 * - Registry functions for batch access
 *
 * @example Simple usage with pre-configured instances
 * ```typescript
 * import { directions, searchAndGeocode } from '@mapbox/mcp-server/tools';
 *
 * // Use directly - httpRequest already configured
 * const result = await directions.execute({ ... });
 * ```
 *
 * @example Advanced usage with custom pipeline
 * ```typescript
 * import { DirectionsTool } from '@mapbox/mcp-server/tools';
 * import { httpRequest } from '@mapbox/mcp-server/utils';
 *
 * const customTool = new DirectionsTool({ httpRequest });
 * ```
 */

import { httpRequest } from '../utils/httpPipeline.js';

// Export all tool classes
export { AreaTool } from './area-tool/AreaTool.js';
export { BearingTool } from './bearing-tool/BearingTool.js';
export { BoundingBoxTool } from './bounding-box-tool/BoundingBoxTool.js';
export { BufferTool } from './buffer-tool/BufferTool.js';
export { CategoryListTool } from './category-list-tool/CategoryListTool.js';
export { CategorySearchTool } from './category-search-tool/CategorySearchTool.js';
export { CentroidTool } from './centroid-tool/CentroidTool.js';
export { DirectionsTool } from './directions-tool/DirectionsTool.js';
export { DistanceTool } from './distance-tool/DistanceTool.js';
export { IsochroneTool } from './isochrone-tool/IsochroneTool.js';
export { MapMatchingTool } from './map-matching-tool/MapMatchingTool.js';
export { MatrixTool } from './matrix-tool/MatrixTool.js';
export { MidpointTool } from './midpoint-tool/MidpointTool.js';
export { OptimizationTool } from './optimization-tool/OptimizationTool.js';
export { PointInPolygonTool } from './point-in-polygon-tool/PointInPolygonTool.js';
export { ResourceReaderTool } from './resource-reader-tool/ResourceReaderTool.js';
export { ReverseGeocodeTool } from './reverse-geocode-tool/ReverseGeocodeTool.js';
export { SearchAndGeocodeTool } from './search-and-geocode-tool/SearchAndGeocodeTool.js';
export { SimplifyTool } from './simplify-tool/SimplifyTool.js';
export { StaticMapImageTool } from './static-map-image-tool/StaticMapImageTool.js';
export { VersionTool } from './version-tool/VersionTool.js';

// Import tool classes for instantiation
import { AreaTool } from './area-tool/AreaTool.js';
import { BearingTool } from './bearing-tool/BearingTool.js';
import { BoundingBoxTool } from './bounding-box-tool/BoundingBoxTool.js';
import { BufferTool } from './buffer-tool/BufferTool.js';
import { CategoryListTool } from './category-list-tool/CategoryListTool.js';
import { CategorySearchTool } from './category-search-tool/CategorySearchTool.js';
import { CentroidTool } from './centroid-tool/CentroidTool.js';
import { DirectionsTool } from './directions-tool/DirectionsTool.js';
import { DistanceTool } from './distance-tool/DistanceTool.js';
import { IsochroneTool } from './isochrone-tool/IsochroneTool.js';
import { MapMatchingTool } from './map-matching-tool/MapMatchingTool.js';
import { MatrixTool } from './matrix-tool/MatrixTool.js';
import { MidpointTool } from './midpoint-tool/MidpointTool.js';
import { OptimizationTool } from './optimization-tool/OptimizationTool.js';
import { PointInPolygonTool } from './point-in-polygon-tool/PointInPolygonTool.js';
import { ResourceReaderTool } from './resource-reader-tool/ResourceReaderTool.js';
import { ReverseGeocodeTool } from './reverse-geocode-tool/ReverseGeocodeTool.js';
import { SearchAndGeocodeTool } from './search-and-geocode-tool/SearchAndGeocodeTool.js';
import { SimplifyTool } from './simplify-tool/SimplifyTool.js';
import { StaticMapImageTool } from './static-map-image-tool/StaticMapImageTool.js';
import { VersionTool } from './version-tool/VersionTool.js';

// Export pre-configured tool instances with short, clean names
// Note: Import path already indicates these are tools, so we omit the "Tool" suffix

/** Compute area of a polygon in square meters or acres */
export const area = new AreaTool();

/** Calculate bearing between two points */
export const bearing = new BearingTool();

/** Calculate bounding box for geometries */
export const boundingBox = new BoundingBoxTool();

/** Create buffer around geometries */
export const buffer = new BufferTool();

/** List available search categories (fallback for clients without resource support) */
export const categoryList = new CategoryListTool({ httpRequest });

/** Search for places by category */
export const categorySearch = new CategorySearchTool({ httpRequest });

/** Calculate centroid of geometries */
export const centroid = new CentroidTool();

/** Get directions between waypoints */
export const directions = new DirectionsTool({ httpRequest });

/** Calculate distance between points */
export const distance = new DistanceTool();

/** Calculate travel time isochrones */
export const isochrone = new IsochroneTool({ httpRequest });

/** Match GPS traces to road network */
export const mapMatching = new MapMatchingTool({ httpRequest });

/** Calculate travel time matrix between multiple points */
export const matrix = new MatrixTool({ httpRequest });

/** Find midpoint between two points */
export const midpoint = new MidpointTool();

/** Solve vehicle routing optimization problems */
export const optimization = new OptimizationTool({ httpRequest });

/** Check if point is inside polygon */
export const pointInPolygon = new PointInPolygonTool();

/** Read MCP resources by URI (fallback for clients without resource support) */
export const resourceReader = new ResourceReaderTool();

/** Reverse geocode coordinates to addresses */
export const reverseGeocode = new ReverseGeocodeTool({ httpRequest });

/** Search for places and geocode addresses */
export const searchAndGeocode = new SearchAndGeocodeTool({ httpRequest });

/** Simplify geometries by reducing points */
export const simplify = new SimplifyTool();

/** Generate static map images */
export const staticMapImage = new StaticMapImageTool({ httpRequest });

/** Get version information */
export const version = new VersionTool();

// Export registry functions for batch access
export {
  getCoreTools,
  getElicitationTools,
  getResourceFallbackTools,
  getToolByName,
  type ToolInstance
} from './toolRegistry.js';
