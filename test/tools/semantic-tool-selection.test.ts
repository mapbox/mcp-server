// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Semantic Tool Selection Tests
 *
 * These tests validate that tool descriptions are optimized for RAG-based
 * semantic matching using OpenAI embeddings (text-embedding-3-small).
 *
 * Tests only run when OPENAI_API_KEY environment variable is set.
 * This allows:
 * - Local testing during development
 * - CI testing with secrets
 * - Skipping in environments without API access
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { getAllTools } from '../../src/tools/toolRegistry.js';

// Skip all tests if no OpenAI API key
const hasApiKey = !!process.env.OPENAI_API_KEY;
const describeIfApiKey = hasApiKey ? describe : describe.skip;

interface EmbeddingResponse {
  data: Array<{
    embedding: number[];
  }>;
}

/**
 * Compute cosine similarity between two embedding vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Get embedding for text using OpenAI API
 */
async function getEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.statusText}`);
  }

  const data = (await response.json()) as EmbeddingResponse;
  return data.data[0].embedding;
}

/**
 * Compute semantic similarity between a query and tool description
 */
async function computeToolSimilarity(
  query: string,
  toolName: string,
  toolDescription: string
): Promise<number> {
  // Mimic how RAG selector embeds tools
  const toolText = `${toolName}\n${toolDescription}`;

  const [queryEmbedding, toolEmbedding] = await Promise.all([
    getEmbedding(query),
    getEmbedding(toolText)
  ]);

  return cosineSimilarity(queryEmbedding, toolEmbedding);
}

/**
 * Find top-k tools most similar to query
 */
async function findTopTools(
  query: string,
  k: number = 3
): Promise<Array<{ name: string; score: number }>> {
  const tools = getAllTools();

  const scores = await Promise.all(
    tools.map(async (tool) => {
      const score = await computeToolSimilarity(
        query,
        tool.name,
        tool.description
      );
      return { name: tool.name, score };
    })
  );

  // Sort by similarity (highest first)
  scores.sort((a, b) => b.score - a.score);

  return scores.slice(0, k);
}

describeIfApiKey('Semantic Tool Selection', () => {
  // Add timeout for API calls
  const apiTimeout = 30000;

  beforeAll(() => {
    if (!hasApiKey) {
      console.log(
        '\nSkipping semantic tool selection tests: OPENAI_API_KEY not set'
      );
    }
  });

  describe('Search and geocoding queries', () => {
    test(
      'query "find coffee shops nearby" should match category_search_tool',
      async () => {
        const topTools = await findTopTools('find coffee shops nearby', 3);
        const toolNames = topTools.map((t) => t.name);

        // category_search_tool should be in top 3
        expect(toolNames).toContain('category_search_tool');

        // Log for debugging
        console.log('Query: "find coffee shops nearby"');
        console.log('Top tools:', topTools);
      },
      apiTimeout
    );

    test(
      'query "where is Starbucks on 5th Avenue" should match search_and_geocode_tool',
      async () => {
        const topTools = await findTopTools(
          'where is Starbucks on 5th Avenue',
          3
        );
        const toolNames = topTools.map((t) => t.name);

        // search_and_geocode_tool should be in top 3
        expect(toolNames).toContain('search_and_geocode_tool');

        console.log('Query: "where is Starbucks on 5th Avenue"');
        console.log('Top tools:', topTools);
      },
      apiTimeout
    );

    test(
      'query "what is the address at these coordinates" should match reverse_geocode_tool',
      async () => {
        const topTools = await findTopTools(
          'what is the address at these coordinates',
          3
        );
        const toolNames = topTools.map((t) => t.name);

        // reverse_geocode_tool should be in top 3
        expect(toolNames).toContain('reverse_geocode_tool');

        console.log('Query: "what is the address at these coordinates"');
        console.log('Top tools:', topTools);
      },
      apiTimeout
    );

    test(
      'query "convert address to coordinates" should match search_and_geocode_tool',
      async () => {
        const topTools = await findTopTools(
          'convert this address to coordinates',
          3
        );
        const toolNames = topTools.map((t) => t.name);

        // search_and_geocode_tool should be in top 3 (forward geocoding)
        expect(toolNames).toContain('search_and_geocode_tool');

        console.log('Query: "convert this address to coordinates"');
        console.log('Top tools:', topTools);
      },
      apiTimeout
    );
  });

  describe('Routing and navigation queries', () => {
    test(
      'query "driving directions from A to B" should match directions_tool',
      async () => {
        const topTools = await findTopTools(
          'driving directions from LAX to Hollywood',
          3
        );
        const toolNames = topTools.map((t) => t.name);

        expect(toolNames).toContain('directions_tool');

        console.log('Query: "driving directions from LAX to Hollywood"');
        console.log('Top tools:', topTools);
      },
      apiTimeout
    );

    test(
      'query "travel time matrix between multiple locations" should match matrix_tool',
      async () => {
        const topTools = await findTopTools(
          'calculate travel times from warehouse to 10 addresses',
          3
        );
        const toolNames = topTools.map((t) => t.name);

        expect(toolNames).toContain('matrix_tool');

        console.log(
          'Query: "calculate travel times from warehouse to 10 addresses"'
        );
        console.log('Top tools:', topTools);
      },
      apiTimeout
    );

    test(
      'query "areas reachable in 30 minutes" should match isochrone_tool',
      async () => {
        const topTools = await findTopTools(
          'show me areas I can reach in 30 minutes',
          3
        );
        const toolNames = topTools.map((t) => t.name);

        expect(toolNames).toContain('isochrone_tool');

        console.log('Query: "show me areas I can reach in 30 minutes"');
        console.log('Top tools:', topTools);
      },
      apiTimeout
    );
  });

  describe('Visualization queries', () => {
    test(
      'query "generate map image" should match static_map_image_tool',
      async () => {
        const topTools = await findTopTools(
          'create a map image showing this location',
          3
        );
        const toolNames = topTools.map((t) => t.name);

        expect(toolNames).toContain('static_map_image_tool');

        console.log('Query: "create a map image showing this location"');
        console.log('Top tools:', topTools);
      },
      apiTimeout
    );
  });

  describe('Category vs specific place disambiguation', () => {
    test(
      'query "all restaurants" should prefer category_search over search_and_geocode',
      async () => {
        const topTools = await findTopTools(
          'show me all restaurants nearby',
          5
        );

        // Find positions of both tools
        const categoryIndex = topTools.findIndex(
          (t) => t.name === 'category_search_tool'
        );
        const searchIndex = topTools.findIndex(
          (t) => t.name === 'search_and_geocode_tool'
        );

        // category_search should rank higher than search_and_geocode
        expect(categoryIndex).toBeLessThan(searchIndex);

        console.log('Query: "show me all restaurants nearby"');
        console.log('Top tools:', topTools);
      },
      apiTimeout
    );

    test(
      'query "specific restaurant name" should prefer search_and_geocode over category_search',
      async () => {
        const topTools = await findTopTools('find McDonalds on Main Street', 5);

        const searchIndex = topTools.findIndex(
          (t) => t.name === 'search_and_geocode_tool'
        );
        const categoryIndex = topTools.findIndex(
          (t) => t.name === 'category_search_tool'
        );

        // search_and_geocode should rank higher than category_search
        expect(searchIndex).toBeLessThan(categoryIndex);

        console.log('Query: "find McDonalds on Main Street"');
        console.log('Top tools:', topTools);
      },
      apiTimeout
    );
  });

  describe('Semantic similarity thresholds', () => {
    test(
      'relevant tools should have similarity > 0.5',
      async () => {
        const queries = [
          { query: 'find directions', expectedTool: 'directions_tool' },
          {
            query: 'search for gas stations',
            expectedTool: 'category_search_tool'
          },
          {
            query: 'geocode an address',
            expectedTool: 'search_and_geocode_tool'
          }
        ];

        for (const { query, expectedTool } of queries) {
          const topTools = await findTopTools(query, 5);
          const tool = topTools.find((t) => t.name === expectedTool);

          expect(tool).toBeDefined();
          expect(tool!.score).toBeGreaterThan(0.5);

          console.log(`Query: "${query}" -> ${expectedTool}: ${tool!.score}`);
        }
      },
      apiTimeout * 3
    );
  });
});

// Export warning if tests are skipped
if (!hasApiKey) {
  console.warn(
    '\n⚠️  Semantic tool selection tests skipped: Set OPENAI_API_KEY to run these tests\n'
  );
}
