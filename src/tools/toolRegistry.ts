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
import { MatrixTool } from './matrix-tool/MatrixTool.js';
import { ResourceReaderTool } from './resource-reader-tool/ResourceReaderTool.js';
import { ReverseGeocodeTool } from './reverse-geocode-tool/ReverseGeocodeTool.js';
import { StaticMapImageTool } from './static-map-image-tool/StaticMapImageTool.js';
import { SearchAndGeocodeTool } from './search-and-geocode-tool/SearchAndGeocodeTool.js';
import { VersionTool } from './version-tool/VersionTool.js';
import { httpRequest } from '../utils/httpPipeline.js';

// Central registry of all tools
export const ALL_TOOLS = [
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
