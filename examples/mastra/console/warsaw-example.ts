/**
 * Warsaw, Poland - Mapbox MCP Server Demo (Mastra)
 *
 * This example demonstrates the Mapbox MCP server with Mastra using
 * landmarks and locations in Warsaw, Poland. Perfect for demos and talks!
 *
 * Learn more about Mastra: https://mastra.ai
 */

import { Agent } from '@mastra/core';
import { MCPClient } from '@mastra/mcp';

// Configure Mapbox MCP Client
export const mapboxMcpClient = new MCPClient({
  id: 'mapbox-mcp-client',
  servers: {
    mapbox: {
      // Use local build from repository
      command: 'node',
      args: ['../../dist/esm/index.js'],
      env: {
        MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN || ''
      }
    }
  }
});

/**
 * Create an agent specialized for Warsaw tourism
 */
async function createWarsawAgent() {
  const tools = await mapboxMcpClient.getTools({ serverName: 'mapbox' });

  return new Agent({
    name: 'Warsaw Tourism Expert',
    instructions: `You are an expert guide for Warsaw, Poland with access to Mapbox geospatial tools.
    You help visitors discover famous landmarks, plan routes, and find interesting places in Warsaw.
    Provide clear, helpful information about locations, distances, and travel times.`,
    model: {
      provider: 'OPEN_AI',
      name: 'gpt-4o-mini',
      toolChoice: 'auto'
    },
    tools: tools
  });
}

/**
 * Find a Warsaw landmark
 */
async function findLandmark(agent: Agent, landmarkName: string) {
  console.log('\n' + '='.repeat(70));
  console.log(`🔍 Finding: ${landmarkName}`);
  console.log('='.repeat(70) + '\n');

  const result = await agent.generate(
    `Find ${landmarkName} in Warsaw, Poland. Provide the coordinates and address.`
  );

  console.log(result.text);
  return result;
}

/**
 * Get directions between two locations
 */
async function getDirections(
  agent: Agent,
  origin: string,
  destination: string
) {
  console.log('\n' + '='.repeat(70));
  console.log(`🗺️  Route: ${origin} → ${destination}`);
  console.log('='.repeat(70) + '\n');

  const result = await agent.generate(
    `Get walking directions from ${origin} to ${destination} in Warsaw, Poland. ` +
      `Include the distance and estimated travel time.`
  );

  console.log(result.text);
  return result;
}

/**
 * Find places near a location
 */
async function findNearbyPlaces(
  agent: Agent,
  location: string,
  category: string
) {
  console.log('\n' + '='.repeat(70));
  console.log(`🔎 Finding ${category} near ${location}`);
  console.log('='.repeat(70) + '\n');

  const result = await agent.generate(
    `Find 3-5 ${category} near ${location} in Warsaw, Poland. ` +
      `Include names and brief descriptions.`
  );

  console.log(result.text);
  return result;
}

/**
 * Main demo function
 */
async function main() {
  console.log('='.repeat(70));
  console.log('🇵🇱 Warsaw, Poland - Mapbox MCP Server Demo (Mastra)');
  console.log('='.repeat(70));

  try {
    const agent = await createWarsawAgent();

    // Scenario 1: Find famous Warsaw landmarks
    console.log('\n' + '='.repeat(70));
    console.log('SCENARIO 1: Famous Warsaw Landmarks');
    console.log('='.repeat(70));

    const landmarks = [
      'Palace of Culture and Science', // Pałac Kultury i Nauki
      'Royal Castle', // Zamek Królewski
      'Old Town Market Square' // Rynek Starego Miasta
    ];

    for (const landmark of landmarks) {
      await findLandmark(agent, landmark);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Brief pause
    }

    // Scenario 2: Get directions between landmarks
    console.log('\n' + '='.repeat(70));
    console.log('SCENARIO 2: Navigate Between Landmarks');
    console.log('='.repeat(70));

    await getDirections(agent, 'Old Town Market Square', 'Royal Castle');

    // Scenario 3: Find nearby places
    console.log('\n' + '='.repeat(70));
    console.log('SCENARIO 3: Discover Nearby Places');
    console.log('='.repeat(70));

    await findNearbyPlaces(agent, 'Palace of Culture and Science', 'cafes');

    // Scenario 4: Find more specific locations
    console.log('\n' + '='.repeat(70));
    console.log('SCENARIO 4: Additional Warsaw Locations');
    console.log('='.repeat(70));

    const otherLocations = [
      'Lazienki Park', // Łazienki Park
      'Wilanow Palace', // Pałac w Wilanowie
      'Warsaw Uprising Museum'
    ];

    for (const location of otherLocations) {
      await findLandmark(agent, location);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ Demo Complete!');
    console.log('='.repeat(70));
    console.log('\nThese examples demonstrate:');
    console.log('• Location search and geocoding');
    console.log('• Turn-by-turn directions');
    console.log('• Point of interest discovery');
    console.log('• TypeScript-first agent development');
    console.log('• MCP integration with Mastra');
  } finally {
    console.log('\nDisconnecting from MCP servers...');
    await mapboxMcpClient.disconnect();
    console.log('Disconnected.');
  }
}

// Run the demo
main().catch(console.error);
