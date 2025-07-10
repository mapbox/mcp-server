// INSERT NEW TOOL IMPORT HERE
import { CategorySearchTool } from './category-search-tool/CategorySearchTool.js';
import { DirectionsTool } from './directions-tool/DirectionsTool.js';
import { ForwardGeocodeTool } from './forward-geocode-tool/ForwardGeocodeTool.js';
import { IsochroneTool } from './isochrone-tool/IsochroneTool.js';
import { MatrixTool } from './matrix-tool/MatrixTool.js';
import { PoiSearchTool } from './poi-search-tool/PoiSearchTool.js';
import { ReverseGeocodeTool } from './reverse-geocode-tool/ReverseGeocodeTool.js';
import { StaticMapImageTool } from './static-map-image-tool/StaticMapImageTool.js';
import { VersionTool } from './version-tool/VersionTool.js';

// Central registry of all tools
export const ALL_TOOLS = [
  // INSERT NEW TOOL INSTANCE HERE
  new VersionTool(),
  new CategorySearchTool(),
  new DirectionsTool(),
  new ForwardGeocodeTool(),
  new IsochroneTool(),
  new MatrixTool(),
  new PoiSearchTool(),
  new ReverseGeocodeTool(),
  new StaticMapImageTool()
] as const;

export type ToolInstance = (typeof ALL_TOOLS)[number];

export function getAllTools(): readonly ToolInstance[] {
  return ALL_TOOLS;
}

export function getToolByName(name: string): ToolInstance | undefined {
  return ALL_TOOLS.find((tool) => tool.name === name);
}
