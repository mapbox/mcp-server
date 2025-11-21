/**
 * Chat API Route - Handles streaming responses from Mapbox MCP agent
 */

import { Agent } from '@mastra/core/agent';
import { MCPClient } from '@mastra/mcp';

// Configure Mapbox MCP Client
const mapboxMcpClient = new MCPClient({
  id: 'mapbox-mcp-client',
  servers: {
    mapbox: {
      // Use local build from repository root
      command: 'node',
      args: ['../../../dist/esm/index.js'],
      env: {
        MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN || ''
      }
    }
  }
});

// Create the agent
async function createMapboxAgent() {
  const tools = await mapboxMcpClient.listTools();

  return new Agent({
    name: 'Warsaw Tour Guide',
    instructions: `You are an expert guide for Warsaw, Poland with access to Mapbox geospatial tools.

    You help visitors:
    - Discover famous landmarks (Palace of Culture, Old Town, Royal Castle, etc.)
    - Plan routes and get directions
    - Find nearby cafes, restaurants, and points of interest
    - Get accurate coordinates and addresses

    When creating static maps, use reasonable dimensions that fit well in a chat interface:
    - Default size: width: 600, height: 400
    - For detailed views: width: 800, height: 500
    - Never exceed 800x600 unless specifically requested

    The UI supports markdown formatting including images. When providing information from search tools that includes images, you can include them using markdown syntax: ![Description](url)

    Always be friendly, informative, and use the Mapbox tools to provide accurate location data.
    When users ask about Warsaw landmarks, use the tools to find exact locations.`,
    model: 'openai/gpt-4o',
    tools: tools
  });
}

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const lastMessage = messages[messages.length - 1];

    const agent = await createMapboxAgent();

    // Collect UI resources from tool results
    const uiResources: unknown[] = [];

    const result = await agent.generate(lastMessage.content, {
      onStepFinish: ({ toolResults }) => {
        // Extract MCP-UI resources from tool results
        if (toolResults) {
          toolResults.forEach((toolResult) => {
            // Content is inside payload.result.content
            const result = toolResult.payload?.result as
              | { content?: unknown[] }
              | undefined;
            const content = result?.content;

            // Look for MCP-UI resources in the content array
            if (content && Array.isArray(content)) {
              content.forEach((contentItem: unknown) => {
                // MCP returns resources with type='resource' and nested resource object
                if (
                  typeof contentItem === 'object' &&
                  contentItem !== null &&
                  'type' in contentItem &&
                  'resource' in contentItem &&
                  (contentItem as { type: string }).type === 'resource'
                ) {
                  uiResources.push(
                    (contentItem as { resource: unknown }).resource
                  );
                }
              });
            }
          });
        }
      }
    });

    // Keep markdown formatting in the response for proper rendering in the UI
    return Response.json({
      role: 'assistant',
      content: result.text,
      uiResources: uiResources.length > 0 ? uiResources : undefined
    });
  } catch (error) {
    console.error('Chat error:', error);
    return Response.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
