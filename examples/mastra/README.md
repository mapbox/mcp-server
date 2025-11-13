# Mastra + Mapbox MCP Server Examples

This directory demonstrates how to integrate the Mapbox MCP server with [Mastra](https://mastra.ai), a TypeScript framework for building AI-powered applications and agents.

**Directory Structure:**

- `console/` - Command-line examples (TypeScript with tsx)
- `web-ui/` - Web chat interface (Next.js + React)

## 📦 Two Ways to Use

### 1. **Console/CLI Examples** 💻

Run directly from the terminal:

- `console/` - Console examples directory
  - `index.ts` - Basic examples with Mapbox tools
  - `warsaw-example.ts` - Warsaw-focused demo

**Quick Start**: `cd console && npm install && npm start`

### 2. **Web UI** 🌐

Beautiful chat interface with Next.js:

- `web-ui/` - Full web application with MCP-UI support
  - Real-time chat interface
  - Support for rich, interactive UI resources via [MCP-UI](https://mcpui.dev)
  - Production-ready Next.js app

**Quick Start**: `cd web-ui && npm install && npm run dev`

---

## What is Mastra?

Mastra is a modern TypeScript framework that provides:

- **Model Routing**: Connect to 40+ LLM providers through a unified interface
- **Agents**: Autonomous systems that leverage language models and tools
- **Workflows**: Graph-based orchestration for multi-step processes
- **MCP Integration**: Native support for Model Context Protocol servers
- **Web UI**: Easy integration with Next.js/React

## Features

These examples show how to:

- Configure the Mapbox MCP client in Mastra
- Create AI agents with access to Mapbox geospatial tools
- Execute location-based queries and tasks
- Use multiple Mapbox capabilities (geocoding, search, directions, etc.)
- Build both CLI and web interfaces

## Prerequisites

- Node.js 20.6 or higher (for built-in .env file support)
- A Mapbox access token ([Get one here](https://account.mapbox.com/))
- An OpenAI API key (or other LLM provider supported by Mastra)

**Note**: This example uses Mastra 1.0.0 beta versions for cleaner dependency resolution.

## Setup

**Note**: Both examples use the local build of the MCP server from the repository by default.

1. Build the MCP server (from repository root):

```bash
cd ../..  # Go to repository root
npm install
npm run build
cd examples/mastra  # Return to example directory
```

2. Choose your example type and install dependencies:

**For Console Examples:**

```bash
cd console
npm install
# Create a .env file
echo "MAPBOX_ACCESS_TOKEN=your_mapbox_token_here" > .env
echo "OPENAI_API_KEY=your_openai_key_here" >> .env
# Run the example
npm start
```

**For Web UI:**

```bash
cd web-ui
npm install
# Create a .env.local file
echo "MAPBOX_ACCESS_TOKEN=your_mapbox_token_here" > .env.local
echo "OPENAI_API_KEY=your_openai_key_here" >> .env.local
# Run the web server
npm run dev
```

The console examples use Node's built-in `--env-file` flag to load environment variables from `.env`. No additional packages needed!

**Note**: If you have Node.js < 20.6 for console examples, you can either:

- Upgrade to Node.js 20.6+ (recommended)
- Export variables manually: `export MAPBOX_ACCESS_TOKEN=your_token && npm start`
- Add `dotenv` package and load it in code

## Usage

### Basic Usage (Console)

The console examples create a Mastra agent with access to all Mapbox tools:

```typescript
// In console/index.ts or console/warsaw-example.ts
import { createMapboxAgent } from './index';

const agent = await createMapboxAgent();

const result = await agent.generate(
  'Find coffee shops near the Empire State Building'
);

console.log(result.text);
```

### Configuration Options

The example supports three ways to connect to the Mapbox MCP server:

**Option 1: Local build (default for this example)**

```typescript
const mapboxMcpClient = new MCPClient({
  id: 'mapbox-mcp-client',
  servers: {
    mapbox: {
      command: 'node',
      args: ['../../dist/esm/index.js'],
      env: {
        MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN
      }
    }
  }
});
```

This is the default since this example is in the repository. Make sure to build first: `npm run build` from repo root.

**Option 2: Published npm package**

```typescript
servers: {
  mapbox: {
    command: 'npx',
    args: ['-y', '@mapbox/mcp-server'],
    env: {
      MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN,
    },
  },
}
```

**Option 3: Hosted MCP endpoint**

```typescript
servers: {
  mapbox: {
    url: new URL('https://mcp.mapbox.com/mcp'),
  },
}
```

### Available Tools

The agent has access to all Mapbox MCP tools:

- **search_and_geocode_tool**: Search for places and convert addresses to coordinates
- **category_search_tool**: Find points of interest by category
- **reverse_geocode_tool**: Convert coordinates to addresses
- **directions_tool**: Get routing directions with multiple travel modes
- **matrix_tool**: Calculate travel times between multiple locations
- **isochrone_tool**: Visualize reachable areas within time/distance
- **static_map_image_tool**: Generate static map images

## Example Queries

Try these prompts with your agent:

**Location Discovery**

- "Find 5 restaurants near Times Square in New York"
- "What's the address of the Eiffel Tower?"

**Navigation & Travel**

- "How long does it take to drive from LAX to Hollywood?"
- "Give me walking directions from Central Park to the Met Museum"

**Analysis & Planning**

- "Show me areas I can reach within 30 minutes of downtown Portland by car"
- "Calculate travel times between these 3 hotels and the convention center"

**Visualization**

- "Create a map showing the route from the Golden Gate Bridge to Fisherman's Wharf"

## Advanced Usage

### Dynamic Tools with Multi-Tenant Support

For applications where credentials vary per user:

```typescript
const agent = new Agent({
  name: 'Multi-tenant Agent',
  model: openai('gpt-4o-mini'),
  tools: async (context) => {
    // Get user-specific credentials
    const userToken = context.user?.mapboxToken;

    // Create a client with user-specific config
    const client = new MCPClient({
      id: `mapbox-${context.user?.id}`,
      servers: {
        mapbox: {
          command: 'npx',
          args: ['-y', '@mapbox/mcp-server'],
          env: {
            MAPBOX_ACCESS_TOKEN: userToken
          }
        }
      }
    });

    return await client.getTools();
  }
});
```

### Custom Agent Instructions

Tailor the agent for specific use cases:

```typescript
const travelAgent = new Agent({
  name: 'Travel Planner',
  instructions: `You are an expert travel planner specializing in urban tourism.

When helping users plan trips:
1. Always consider walking distance and accessibility
2. Suggest optimal routes that minimize travel time
3. Recommend landmarks and attractions along the way
4. Provide estimated travel times with traffic considerations
5. Generate maps to help visualize the journey`,
  model: openai('gpt-4o'),
  tools: await mapboxMcpClient.getTools()
});
```

### Proper Cleanup

Always disconnect from MCP servers when done to avoid leaving processes hanging:

```typescript
async function main() {
  try {
    // Create agent and run queries
    const agent = await createMapboxAgent();
    const result = await agent.generate('Find restaurants near me');
    console.log(result.text);
  } finally {
    // Gracefully disconnect from MCP servers
    await mapboxMcpClient.disconnect();
  }
}
```

**Why this matters**:

- **Disconnects from servers**: Closes the connection to the MCP server process
- **Releases resources**: Frees up system resources and prevents memory leaks
- **Clean exit**: Without disconnect, Node.js may hang and not exit cleanly
- **Finally block**: Ensures cleanup happens even if errors occur

**Note**: Agents don't require explicit cleanup - only the `MCPClient` needs to be disconnected.

## Troubleshooting

### Connection Issues

If you encounter connection errors:

1. Verify your Mapbox access token is valid
2. Check that Node.js is in your PATH
3. Try using the hosted endpoint instead

### Tool Errors

If tools fail to execute:

1. Ensure your Mapbox token has the necessary permissions
2. Check the Mastra logs for detailed error messages
3. Verify the tool parameters are valid

### Rate Limits

Mapbox APIs have rate limits. For production use:

1. Implement caching for repeated queries
2. Monitor your API usage at https://account.mapbox.com/
3. Consider upgrading your Mapbox plan for higher limits

## Learn More

- **Mastra Documentation**: https://mastra.ai/docs
- **Mapbox MCP Server**: https://github.com/mapbox/mcp-server
- **MCP Protocol**: https://modelcontextprotocol.io
- **Mapbox APIs**: https://docs.mapbox.com/

## Support

For issues specific to:

- **Mastra**: https://github.com/mastra-ai/mastra/issues
- **Mapbox MCP Server**: mcp-feedback@mapbox.com
- **Mapbox APIs**: https://support.mapbox.com/
