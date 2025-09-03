import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { parseToolConfigFromArgs, filterTools } from './config/toolConfig.js';
import { getAllTools } from './tools/toolRegistry.js';
import { getVersionInfo } from './utils/versionUtils.js';
import 'dotenv/config';

const serverVersionInfo = getVersionInfo();

// Parse configuration from command-line arguments
const config = parseToolConfigFromArgs();

// Get and filter tools based on configuration
const allTools = getAllTools();
const enabledTools = filterTools(allTools, config);

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

// Register enabled tools to the server
enabledTools.forEach((tool) => {
  tool.installTo(server);
});

async function main() {
  // Start receiving messages on stdin and sending messages on stdout
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Fatal error starting MCP server:', error);
  process.exit(1);
});
