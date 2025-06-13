import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CategorySearchTool } from './tools/category-search-tool/CategorySearchTool.js';
import { DirectionsTool } from './tools/directions-tool/DirectionsTool.js';
import { ForwardGeocodeTool } from './tools/forward-geocode-tool/ForwardGeocodeTool.js';
import { IsochroneTool } from './tools/isochrone-tool/IsochroneTool.js';
import { MatrixTool } from './tools/matrix-tool/MatrixTool.js';
import { PoiSearchTool } from './tools/poi-search-tool/PoiSearchTool.js';
import { ReverseGeocodeTool } from './tools/reverse-geocode-tool/ReverseGeocodeTool.js';
import { StaticMapImageTool } from './tools/static-map-image-tool/StaticMapImageTool.js';
import { patchGlobalFetch } from './utils/requestUtils.js';
import { getVersionInfo } from './utils/versionUtils.js';

// INSERT NEW TOOL IMPORT HERE

let serverVersionInfo = getVersionInfo();
patchGlobalFetch(serverVersionInfo);

// Create an MCP server
const server = new McpServer(
  {
    name: serverVersionInfo.name,
    version: serverVersionInfo.version
  },
  {
    capabilities: {
      logging: {}
    }
  }
);

// INSERT NEW TOOL REGISTRATION HERE
new MatrixTool().installTo(server);
new ReverseGeocodeTool().installTo(server);
new ForwardGeocodeTool().installTo(server);
new IsochroneTool().installTo(server);
new PoiSearchTool().installTo(server);
new CategorySearchTool().installTo(server);
new StaticMapImageTool().installTo(server);
new DirectionsTool().installTo(server);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
