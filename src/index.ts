import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getAllTools } from './tools/toolRegistry.js';
import { patchGlobalFetch } from './utils/requestUtils.js';
import { getVersionInfo } from './utils/versionUtils.js';

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

// Register all tools from the registry
getAllTools().forEach((tool) => {
  tool.installTo(server);
});

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
