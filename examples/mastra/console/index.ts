/**
 * Mastra MCP Integration Example
 *
 * This example demonstrates how to use the Mapbox MCP server with Mastra agents.
 * Mastra is a TypeScript framework for building AI-powered applications and agents.
 *
 * Learn more about Mastra: https://mastra.ai
 */

import { Agent } from '@mastra/core/agent';
import { MCPClient } from '@mastra/mcp';

/**
 * Configure the Mapbox MCP client
 *
 * This creates an MCP client that connects to the Mapbox MCP server.
 * The server can be run in three ways:
 * 1. Local build (default for this example): Uses ../../dist/esm/index.js
 * 2. Published npm package: npx -y @mapbox/mcp-server
 * 3. Hosted endpoint: https://mcp.mapbox.com/mcp
 */
export const mapboxMcpClient = new MCPClient({
  id: 'mapbox-mcp-client',
  servers: {
    mapbox: {
      // Option 1: Use local build from repository (default for this example)
      // Make sure to run `npm run build` from the repository root first!
      command: 'node',
      args: ['../../dist/esm/index.js'],

      // Option 2: Use the published npm package (uncomment to use)
      // command: 'npx',
      // args: ['-y', '@mapbox/mcp-server'],

      // Option 3: Use hosted MCP endpoint (uncomment to use)
      // url: new URL('https://mcp.mapbox.com/mcp'),

      // Pass the Mapbox access token via environment
      env: {
        MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN || ''
      }
    }
  }
});

/**
 * Create a Mastra agent with Mapbox tools
 *
 * This agent will have access to all Mapbox MCP tools including:
 * - Geocoding (forward and reverse)
 * - Search (POI search, category search)
 * - Directions (driving, walking, cycling)
 * - Matrix (travel time/distance calculations)
 * - Isochrone (reachability analysis)
 * - Static maps (map image generation)
 */
export async function createMapboxAgent() {
  // Get tools from the MCP client
  const tools = await mapboxMcpClient.listTools();

  // Create an agent with Mapbox tools
  const agent = new Agent({
    name: 'Mapbox Travel Assistant',
    instructions: `You are a helpful travel assistant with access to Mapbox's geospatial tools.

You can help users with:
- Finding locations and addresses (geocoding)
- Searching for points of interest (restaurants, hotels, gas stations, etc.)
- Getting directions and route planning
- Calculating travel times between multiple locations
- Visualizing areas reachable within a time/distance
- Generating map images

When responding to users:
1. Use the appropriate Mapbox tools to gather information
2. Provide clear, helpful responses with relevant details
3. If generating maps, mention that the user can view them
4. Always consider traffic and time constraints when relevant`,
    model: 'openai/gpt-4o',
    tools
  });

  return agent;
}

/**
 * Example usage
 */
async function main() {
  // Verify Mapbox access token is set
  if (!process.env.MAPBOX_ACCESS_TOKEN) {
    throw new Error(
      'MAPBOX_ACCESS_TOKEN environment variable is required. ' +
        'Get your token at https://account.mapbox.com/'
    );
  }

  try {
    console.log('Creating Mapbox agent...');
    const agent = await createMapboxAgent();

    console.log('Agent created! Running example queries...\n');

    // Example 1: Find coffee shops
    console.log('=== Example 1: Finding coffee shops ===');
    const result1 = await agent.generate(
      'Find 3 coffee shops near the Empire State Building in New York'
    );
    console.log(result1.text);
    console.log('');

    // Example 2: Get directions
    console.log('=== Example 2: Getting directions ===');
    const result2 = await agent.generate(
      'How long does it take to drive from Times Square to Central Park in New York during rush hour?'
    );
    console.log(result2.text);
    console.log('');

    // Example 3: Reachability analysis
    console.log('=== Example 3: Reachability analysis ===');
    const result3 = await agent.generate(
      'Show me the area I can reach within 15 minutes of driving from the Golden Gate Bridge'
    );
    console.log(result3.text);
    console.log('');

    // Example 4: Travel planning with multiple locations
    console.log('=== Example 4: Travel planning ===');
    const result4 = await agent.generate(
      'I want to visit the Statue of Liberty, Empire State Building, and Times Square. ' +
        'Calculate the travel times between these locations and suggest an optimal route.'
    );
    console.log(result4.text);
  } finally {
    // Gracefully disconnect from MCP servers
    console.log('\nDisconnecting from MCP servers...');
    await mapboxMcpClient.disconnect();
    console.log('Disconnected.');
  }
}

main().catch(console.error);
