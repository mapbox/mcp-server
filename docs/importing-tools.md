# Importing Tools, Resources, and Prompts

This guide shows how to import and use Mapbox MCP Server components directly in your own applications, without running the full MCP server.

## Overview

The Mapbox MCP Server exposes several subpath exports for direct integration:

- `@mapbox/mcp-server/tools` - Geospatial tools (routing, search, geocoding, etc.)
- `@mapbox/mcp-server/resources` - Static resources (category lists, etc.)
- `@mapbox/mcp-server/prompts` - Pre-built prompts for common workflows
- `@mapbox/mcp-server/utils` - HTTP pipeline utilities

All exports support both **ESM** and **CommonJS** via dual builds powered by [tshy](https://github.com/isaacs/tshy).

## Installation

```bash
npm install @mapbox/mcp-server
```

## Usage Patterns

### Simple: Pre-configured Instances

The easiest way to use tools is with pre-configured instances. These come with the HTTP pipeline already set up:

```typescript
import {
  directions,
  searchAndGeocode,
  isochrone
} from '@mapbox/mcp-server/tools';

// Tools are ready to use immediately
const result = await directions.execute({
  coordinates: [
    [-122.4194, 37.7749], // San Francisco
    [-118.2437, 34.0522] // Los Angeles
  ],
  profile: 'driving-traffic'
});
```

### Advanced: Custom Tool Instances

For more control, import tool classes and instantiate with your own configuration:

```typescript
import { DirectionsTool, IsochroneTool } from '@mapbox/mcp-server/tools';
import { httpRequest } from '@mapbox/mcp-server/utils';

// Create tool instances with the default pipeline
const directions = new DirectionsTool({ httpRequest });
const isochrone = new IsochroneTool({ httpRequest });
```

### Expert: Custom HTTP Pipeline

For full customization, create your own HTTP pipeline with custom policies:

```typescript
import { DirectionsTool, SearchAndGeocodeTool } from '@mapbox/mcp-server/tools';
import {
  HttpPipeline,
  UserAgentPolicy,
  RetryPolicy,
  TracingPolicy
} from '@mapbox/mcp-server/utils';

// Create a custom pipeline
const pipeline = new HttpPipeline();

// Add custom policies
pipeline.usePolicy(new UserAgentPolicy('MyApp/2.0.0'));
pipeline.usePolicy(
  new RetryPolicy(
    5, // maxRetries
    300, // baseDelayMs
    3000 // maxDelayMs
  )
);
pipeline.usePolicy(new TracingPolicy());

// Add your own custom policy
pipeline.usePolicy({
  id: 'custom-auth',
  async handle(input, init, next) {
    // Add custom headers, logging, etc.
    const headers = new Headers(init.headers);
    headers.set('X-Custom-Header', 'value');

    return next(input, { ...init, headers });
  }
});

// Use the custom pipeline
const httpRequest = pipeline.execute.bind(pipeline);
const directions = new DirectionsTool({ httpRequest });
const search = new SearchAndGeocodeTool({ httpRequest });
```

## Available Tools

### Pre-configured Instances

Import ready-to-use tool instances:

```typescript
import {
  // Geometry tools (no HTTP required)
  area,
  bearing,
  boundingBox,
  buffer,
  centroid,
  distance,
  midpoint,
  pointInPolygon,
  simplify,

  // API tools (HTTP pre-configured)
  categorySearch,
  directions,
  isochrone,
  mapMatching,
  matrix,
  optimization,
  reverseGeocode,
  searchAndGeocode,
  staticMapImage,

  // Utility tools
  version
} from '@mapbox/mcp-server/tools';
```

### Tool Classes

Import classes for custom instantiation:

```typescript
import {
  // Geometry tools
  AreaTool,
  BearingTool,
  BoundingBoxTool,
  BufferTool,
  CentroidTool,
  DistanceTool,
  MidpointTool,
  PointInPolygonTool,
  SimplifyTool,

  // API tools
  CategorySearchTool,
  DirectionsTool,
  IsochroneTool,
  MapMatchingTool,
  MatrixTool,
  OptimizationTool,
  ReverseGeocodeTool,
  SearchAndGeocodeTool,
  StaticMapImageTool,

  // Utility tools
  VersionTool
} from '@mapbox/mcp-server/tools';
```

### Registry Functions

For batch access to tools:

```typescript
import {
  getCoreTools,
  getElicitationTools,
  getResourceFallbackTools,
  getToolByName
} from '@mapbox/mcp-server/tools';

// Get all core tools
const coreTools = getCoreTools();

// Find a specific tool by name
const directionsTool = getToolByName('directions_tool');
```

## Resources

Resources provide static reference data:

```typescript
import { categoryList } from '@mapbox/mcp-server/resources';

// Read the category list resource
const categories = await categoryList.read();
```

Custom instantiation:

```typescript
import { CategoryListResource } from '@mapbox/mcp-server/resources';
import { httpRequest } from '@mapbox/mcp-server/utils';

const resource = new CategoryListResource({ httpRequest });
```

## Prompts

Prompts provide pre-built workflows:

```typescript
import {
  getDirections,
  findPlacesNearby,
  searchAlongRoute,
  showReachableAreas
} from '@mapbox/mcp-server/prompts';

// Use a prompt
const result = await getDirections.execute({
  origin: 'San Francisco, CA',
  destination: 'Los Angeles, CA'
});
```

Custom instantiation:

```typescript
import { GetDirectionsPrompt } from '@mapbox/mcp-server/prompts';

const prompt = new GetDirectionsPrompt();
```

## HTTP Pipeline Utilities

### Default Pipeline

Use the pre-configured default pipeline:

```typescript
import { httpRequest } from '@mapbox/mcp-server/utils';

// Pre-configured with User-Agent, Retry, and Tracing policies
const response = await httpRequest('https://api.mapbox.com/...');
```

### Custom Pipeline

Build your own pipeline:

```typescript
import {
  HttpPipeline,
  UserAgentPolicy,
  RetryPolicy,
  TracingPolicy,
  type HttpPolicy
} from '@mapbox/mcp-server/utils';

const pipeline = new HttpPipeline();
pipeline.usePolicy(new UserAgentPolicy('MyApp/1.0.0'));
pipeline.usePolicy(new RetryPolicy(3, 200, 2000));
pipeline.usePolicy(new TracingPolicy());

// Create custom policy
const customPolicy: HttpPolicy = {
  id: 'my-policy',
  async handle(input, init, next) {
    console.log('Making request to:', input);
    return next(input, init);
  }
};
pipeline.usePolicy(customPolicy);

// Use the pipeline
const httpRequest = pipeline.execute.bind(pipeline);
```

### Managing Policies

```typescript
import { HttpPipeline, systemHttpPipeline } from '@mapbox/mcp-server/utils';

// Access the system pipeline
const policies = systemHttpPipeline.listPolicies();

// Find a policy by ID
const retryPolicy = systemHttpPipeline.findPolicyById('system-retry-policy');

// Remove a policy
systemHttpPipeline.removePolicy('system-retry-policy');

// Add it back
systemHttpPipeline.usePolicy(retryPolicy!);
```

## CommonJS Support

All subpath exports work in CommonJS too:

```javascript
// CommonJS
const { directions, searchAndGeocode } = require('@mapbox/mcp-server/tools');
const { httpRequest } = require('@mapbox/mcp-server/utils');

// ESM
import { directions, searchAndGeocode } from '@mapbox/mcp-server/tools';
import { httpRequest } from '@mapbox/mcp-server/utils';
```

## Type Definitions

Full TypeScript support is included:

```typescript
import type {
  ToolInstance,
  HttpRequest,
  TracedRequestInit,
  HttpPolicy
} from '@mapbox/mcp-server/tools';
import type { ResourceInstance } from '@mapbox/mcp-server/resources';
import type { PromptInstance } from '@mapbox/mcp-server/prompts';
```

## Example: Building a Custom MCP Server

Here's how you might use these exports to build your own MCP server with a subset of tools:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Import only the tools you need
import {
  directions,
  searchAndGeocode,
  isochrone
} from '@mapbox/mcp-server/tools';

const server = new Server(
  {
    name: 'my-custom-mcp-server',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// Register selected tools
server.setRequestHandler('tools/list', async () => ({
  tools: [
    directions.definition,
    searchAndGeocode.definition,
    isochrone.definition
  ]
}));

server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'directions_tool':
      return await directions.execute(args);
    case 'search_and_geocode_tool':
      return await searchAndGeocode.execute(args);
    case 'isochrone_tool':
      return await isochrone.execute(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

## Example: Using in a Web Application

Use tools directly in a web app without MCP:

```typescript
import { searchAndGeocode, directions } from '@mapbox/mcp-server/tools';

async function findRoute(origin: string, destination: string) {
  // Geocode the origin
  const originResult = await searchAndGeocode.execute({
    query: origin,
    limit: 1
  });

  // Geocode the destination
  const destResult = await searchAndGeocode.execute({
    query: destination,
    limit: 1
  });

  // Get directions
  const route = await directions.execute({
    coordinates: [
      originResult.features[0].geometry.coordinates,
      destResult.features[0].geometry.coordinates
    ],
    profile: 'driving'
  });

  return route;
}

// Use it
const route = await findRoute('San Francisco', 'Los Angeles');
console.log('Duration:', route.routes[0].duration, 'seconds');
```

## Best Practices

1. **Use pre-configured instances** for simple use cases
2. **Import only what you need** to keep bundle size small
3. **Reuse tool instances** rather than creating new ones repeatedly
4. **Use the default httpRequest** unless you need custom behavior
5. **Create custom pipelines** only when you need different retry logic, user agents, or custom policies
6. **Bind pipeline.execute** when passing to tools: `pipeline.execute.bind(pipeline)`

## See Also

- [Engineering Standards](./engineering_standards.md) - Project architecture and patterns
- [Tracing Setup](./tracing.md) - OpenTelemetry configuration
- [Main README](../README.md) - Full MCP server documentation
