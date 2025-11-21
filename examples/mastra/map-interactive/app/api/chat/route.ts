/**
 * Chat API Route - Handles streaming responses from Mapbox MCP agent
 * with map command generation
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
    name: 'Warsaw Interactive Map Guide',
    instructions: `You are an expert guide for Warsaw, Poland with access to Mapbox geospatial tools.
Your responses control an interactive Mapbox GL JS map.

IMPORTANT: After using tools to find locations, you MUST provide map commands in your response.

Map Command Format:
When you want to control the map, include a JSON code block with the label "MAP_COMMANDS" containing an array of commands:

\`\`\`MAP_COMMANDS
[
  {
    "type": "flyTo",
    "data": {
      "center": { "lng": 21.0122, "lat": 52.2297 },
      "zoom": 15,
      "pitch": 45,
      "bearing": 0
    }
  },
  {
    "type": "addMarker",
    "data": {
      "location": { "lng": 21.0122, "lat": 52.2297 },
      "color": "#ff0000",
      "popup": "<strong>Palace of Culture</strong><br>Famous landmark"
    }
  }
]
\`\`\`

Available command types:
1. "flyTo" - Animate camera to location
   - center: { lng, lat }
   - zoom: 0-22 (default: 15)
   - pitch: 0-60 (default: 45)
   - bearing: 0-360 (default: 0)

2. "addMarker" - Add a marker to the map
   - location: { lng, lat }
   - color: hex color (default: "#ff0000")
   - popup: HTML string (optional)

3. "clearMarkers" - Remove all markers
   - No data needed

4. "drawRoute" - Draw a route line
   - coordinates: [[lng, lat], [lng, lat], ...]
   - color: hex color (default: "#007bff")

Workflow:
1. Use search_and_geocode_tool to find locations
2. Extract coordinates from results
3. Generate appropriate map commands
4. Provide friendly text explanation

Example interaction:
User: "Show me the Palace of Culture and Science"
You:
- Use search_and_geocode_tool to find it
- Get coordinates (e.g., 21.006912, 52.231953)
- Respond with:
  * Text: "Flying to the Palace of Culture and Science! This iconic building..."
  * MAP_COMMANDS: flyTo to location + addMarker

User: "Get directions from Old Town to Royal Castle"
You:
- Use geocode tools to get both locations
- Use directions_tool with geometries='geojson' to get the route (IMPORTANT: must set geometries='geojson' to get route geometry!)
- Extract the coordinates from routes[0].geometry.coordinates
- Respond with:
  * Text: "Here's your route from Old Town to Royal Castle..."
  * MAP_COMMANDS: drawRoute with the geometry coordinates + flyTo to fit bounds

CRITICAL for directions:
When requesting directions, you MUST:
1. Call directions_tool with the parameter geometries='geojson' (without this, no geometry is returned!)
2. Extract routes[0].geometry.coordinates from the response
3. Use those coordinates in the drawRoute command
4. The coordinates should be an array of [lng, lat] pairs representing the actual route path

Example MAP_COMMANDS for directions:
\`\`\`MAP_COMMANDS
[
  {
    "type": "drawRoute",
    "data": {
      "coordinates": [[21.006912, 52.231953], [21.007123, 52.232145], ...],
      "color": "#007bff"
    }
  },
  {
    "type": "flyTo",
    "data": {
      "center": {"lng": 21.015, "lat": 52.235},
      "zoom": 13
    }
  }
]
\`\`\`

The UI supports markdown formatting including images. When providing information from search tools that includes images, you can include them using markdown syntax: ![Description](url)

Always be friendly, informative, and generate map commands when working with locations!`,
    model: 'openai/gpt-4o',
    tools: tools
  });
}

// Extract map commands from agent response
function extractMapCommands(text: string): {
  cleanText: string;
  mapCommands: unknown[];
} {
  const mapCommandsRegex = /```MAP_COMMANDS\s*\n([\s\S]*?)\n```/g;
  const matches = [...text.matchAll(mapCommandsRegex)];

  if (matches.length === 0) {
    return { cleanText: text, mapCommands: [] };
  }

  let mapCommands: unknown[] = [];
  let cleanText = text;

  matches.forEach((match) => {
    try {
      const commands = JSON.parse(match[1]);
      if (Array.isArray(commands)) {
        mapCommands = [...mapCommands, ...commands];
      }
      // Remove the command block from text
      cleanText = cleanText.replace(match[0], '').trim();
    } catch (e) {
      console.error('Failed to parse map commands:', e);
    }
  });

  return { cleanText, mapCommands };
}

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const lastMessage = messages[messages.length - 1];

    const agent = await createMapboxAgent();

    const result = await agent.generate(lastMessage.content);

    // Extract map commands from the response
    const { cleanText, mapCommands } = extractMapCommands(result.text);

    return Response.json({
      message: {
        role: 'assistant',
        content: cleanText
      },
      mapCommands: mapCommands.length > 0 ? mapCommands : undefined
    });
  } catch (error) {
    console.error('Chat error:', error);
    return Response.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
