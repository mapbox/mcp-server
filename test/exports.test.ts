// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';

describe('Package exports', () => {
  describe('tools subpath', () => {
    it('should export pre-configured tool instances', async () => {
      const { directions, searchAndGeocode, isochrone } =
        await import('../src/tools/index.js');

      expect(directions).toBeDefined();
      expect(directions.name).toBe('directions_tool');
      expect(searchAndGeocode).toBeDefined();
      expect(searchAndGeocode.name).toBe('search_and_geocode_tool');
      expect(isochrone).toBeDefined();
      expect(isochrone.name).toBe('isochrone_tool');
    });

    it('should export tool classes', async () => {
      const { DirectionsTool, SearchAndGeocodeTool, IsochroneTool } =
        await import('../src/tools/index.js');

      expect(DirectionsTool).toBeDefined();
      expect(SearchAndGeocodeTool).toBeDefined();
      expect(IsochroneTool).toBeDefined();
    });

    it('should export registry functions', async () => {
      const {
        getAllTools,
        getCoreTools,
        getElicitationTools,
        getResourceFallbackTools
      } = await import('../src/tools/index.js');

      expect(getAllTools).toBeDefined();
      expect(typeof getAllTools).toBe('function');
      expect(getCoreTools).toBeDefined();
      expect(getElicitationTools).toBeDefined();
      expect(getResourceFallbackTools).toBeDefined();

      const coreTools = getCoreTools();
      expect(coreTools.length).toBeGreaterThan(0);
    });
  });

  describe('resources subpath', () => {
    it('should export pre-configured resource instances', async () => {
      const { categoryList } = await import('../src/resources/index.js');

      expect(categoryList).toBeDefined();
      expect(categoryList.uri).toContain('categories');
    });

    it('should export resource classes', async () => {
      const { CategoryListResource } =
        await import('../src/resources/index.js');

      expect(CategoryListResource).toBeDefined();
    });

    it('should export registry functions', async () => {
      const { getAllResources, getResourceByUri } =
        await import('../src/resources/index.js');

      expect(getAllResources).toBeDefined();
      expect(getResourceByUri).toBeDefined();

      const resources = getAllResources();
      expect(resources.length).toBeGreaterThan(0);
    });
  });

  describe('prompts subpath', () => {
    it('should export pre-configured prompt instances', async () => {
      const { getDirections, findPlacesNearby, searchAlongRoute } =
        await import('../src/prompts/index.js');

      expect(getDirections).toBeDefined();
      expect(getDirections.name).toBe('get-directions');
      expect(findPlacesNearby).toBeDefined();
      expect(findPlacesNearby.name).toBe('find-places-nearby');
      expect(searchAlongRoute).toBeDefined();
      expect(searchAlongRoute.name).toBe('search-along-route');
    });

    it('should export prompt classes', async () => {
      const {
        GetDirectionsPrompt,
        FindPlacesNearbyPrompt,
        SearchAlongRoutePrompt
      } = await import('../src/prompts/index.js');

      expect(GetDirectionsPrompt).toBeDefined();
      expect(FindPlacesNearbyPrompt).toBeDefined();
      expect(SearchAlongRoutePrompt).toBeDefined();
    });

    it('should export registry functions', async () => {
      const { getAllPrompts, getPromptByName } =
        await import('../src/prompts/index.js');

      expect(getAllPrompts).toBeDefined();
      expect(getPromptByName).toBeDefined();

      const prompts = getAllPrompts();
      expect(prompts.length).toBeGreaterThan(0);
    });
  });

  describe('utils subpath', () => {
    it('should export httpRequest', async () => {
      const { httpRequest } = await import('../src/utils/index.js');

      expect(httpRequest).toBeDefined();
      expect(typeof httpRequest).toBe('function');
    });

    it('should export HttpPipeline and policies', async () => {
      const {
        HttpPipeline,
        UserAgentPolicy,
        RetryPolicy,
        TracingPolicy,
        systemHttpPipeline
      } = await import('../src/utils/index.js');

      expect(HttpPipeline).toBeDefined();
      expect(UserAgentPolicy).toBeDefined();
      expect(RetryPolicy).toBeDefined();
      expect(TracingPolicy).toBeDefined();
      expect(systemHttpPipeline).toBeDefined();
    });

    it('should allow creating custom pipelines', async () => {
      const { HttpPipeline, UserAgentPolicy, RetryPolicy } =
        await import('../src/utils/index.js');

      const pipeline = new HttpPipeline();
      pipeline.usePolicy(new UserAgentPolicy('TestApp/1.0.0'));
      pipeline.usePolicy(new RetryPolicy(3, 200, 2000));

      const policies = pipeline.listPolicies();
      expect(policies).toHaveLength(2);
      expect(policies[0]).toBeInstanceOf(UserAgentPolicy);
      expect(policies[1]).toBeInstanceOf(RetryPolicy);
    });

    it('should export getVersionInfo', async () => {
      const { getVersionInfo } = await import('../src/utils/index.js');

      expect(getVersionInfo).toBeDefined();
      expect(typeof getVersionInfo).toBe('function');
    });

    it('should export server setup helpers', async () => {
      const {
        publishJsonSchema2020,
        toJsonSchema2020,
        buildServerInstructions
      } = await import('../src/utils/index.js');

      expect(typeof publishJsonSchema2020).toBe('function');
      expect(typeof toJsonSchema2020).toBe('function');
      expect(typeof buildServerInstructions).toBe('function');
    });

    // Mirrors how an external deployment (e.g. hosted-mcp-server) builds its
    // own McpServer from the subpath exports instead of running src/index.ts.
    it('should give an externally built server 2020-12 schemas and instructions', async () => {
      const { McpServer } =
        await import('@modelcontextprotocol/sdk/server/mcp.js');
      const { Client } =
        await import('@modelcontextprotocol/sdk/client/index.js');
      const { InMemoryTransport } =
        await import('@modelcontextprotocol/sdk/inMemory.js');
      const { publishJsonSchema2020, buildServerInstructions } =
        await import('../src/utils/index.js');
      const { getAllTools } = await import('../src/tools/index.js');

      const tools = getAllTools();
      const server = new McpServer(
        { name: 'external', version: '0.0.0' },
        {
          capabilities: { tools: {} },
          instructions: buildServerInstructions(tools.map((t) => t.name))
        }
      );
      publishJsonSchema2020(server);
      tools.forEach((tool) => tool.installTo(server));

      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      const client = new Client({ name: 'test', version: '0.0.0' });
      await Promise.all([
        server.connect(serverTransport),
        client.connect(clientTransport)
      ]);

      expect(client.getInstructions()).toContain('use render_map_tool');
      const listed = (await client.listTools()).tools;
      for (const tool of listed) {
        expect(tool.inputSchema.$schema, tool.name).toBe(
          'https://json-schema.org/draft/2020-12/schema'
        );
        if (tool.outputSchema) {
          expect(tool.outputSchema.$schema, tool.name).toBe(
            'https://json-schema.org/draft/2020-12/schema'
          );
        }
      }
      await client.close();
    });

    it('should allow using custom pipeline with tools', async () => {
      const { HttpPipeline, UserAgentPolicy } =
        await import('../src/utils/index.js');
      const { DirectionsTool } = await import('../src/tools/index.js');

      const pipeline = new HttpPipeline();
      pipeline.usePolicy(new UserAgentPolicy('CustomApp/1.0.0'));

      const httpRequest = pipeline.execute.bind(pipeline);
      const tool = new DirectionsTool({ httpRequest });

      expect(tool).toBeDefined();
      expect(tool.name).toBe('directions_tool');
    });
  });
});
