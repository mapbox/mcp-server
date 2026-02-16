// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Example: Using Mapbox MCP Server tools in your own MCP server
 *
 * This example demonstrates how to import and use tools to build
 * a custom MCP server with a subset of Mapbox tools.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Import pre-configured tool instances
import {
  directions,
  searchAndGeocode,
  isochrone
} from '@mapbox/mcp-server/tools';

// Create a custom MCP server with selected tools
async function createCustomMcpServer() {
  const server = new McpServer(
    {
      name: 'my-custom-mapbox-server',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // Install only the tools you need
  directions.installTo(server);
  searchAndGeocode.installTo(server);
  isochrone.installTo(server);

  console.log('Installed 3 Mapbox tools to custom MCP server');

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  return server;
}

// Advanced usage: Create tools with custom HTTP pipeline
async function createServerWithCustomPipeline() {
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
  const { StdioServerTransport } =
    await import('@modelcontextprotocol/sdk/server/stdio.js');
  const { DirectionsTool } = await import('@mapbox/mcp-server/tools');
  const { HttpPipeline, UserAgentPolicy, RetryPolicy } =
    await import('@mapbox/mcp-server/utils');

  // Create custom HTTP pipeline with your own policies
  const pipeline = new HttpPipeline();
  pipeline.usePolicy(new UserAgentPolicy('MyCustomApp/2.0.0'));
  pipeline.usePolicy(
    new RetryPolicy(
      5, // More retries
      300, // Longer base delay
      5000 // Higher max delay
    )
  );

  // Add custom logging policy
  pipeline.usePolicy({
    id: 'request-logger',
    async handle(input, init, next) {
      console.log('Making request to:', input);
      const start = Date.now();
      const response = await next(input, init);
      console.log('Request took:', Date.now() - start, 'ms');
      return response;
    }
  });

  // Create tool instance with custom pipeline
  const httpRequest = pipeline.execute.bind(pipeline);
  const customDirections = new DirectionsTool({ httpRequest });

  // Install to MCP server
  const server = new McpServer(
    {
      name: 'custom-pipeline-server',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  customDirections.installTo(server);

  console.log('Created MCP server with custom HTTP pipeline');

  const transport = new StdioServerTransport();
  await server.connect(transport);

  return server;
}

// Selective tool imports: Import only what you need to keep bundle size small
async function selectiveImports() {
  const { McpServer: Server } =
    await import('@modelcontextprotocol/sdk/server/mcp.js');

  // Import just the Turf.js geometry tools (no HTTP calls needed)
  const { area, distance, bearing, centroid } =
    await import('@mapbox/mcp-server/tools');

  const server = new Server(
    {
      name: 'geometry-only-server',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // Install only geometry tools
  area.installTo(server);
  distance.installTo(server);
  bearing.installTo(server);
  centroid.installTo(server);

  console.log('Created lightweight geometry-only MCP server');

  return server;
}

// Run examples (function is unused in this example file but left for reference)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _main() {
  console.log('=== Create Custom MCP Server ===\n');
  await createCustomMcpServer();

  console.log('\n=== Custom HTTP Pipeline ===\n');
  await createServerWithCustomPipeline();

  console.log('\n=== Selective Tool Imports ===\n');
  await selectiveImports();
}

// To run this example:
// 1. Build the package: npm run build
// 2. Uncomment the line below
// 3. Run: node dist/esm/examples/import-example.js
//
// _main().catch(console.error);
