// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, test, expect } from 'vitest';
import { getAllTools } from '../../src/tools/toolRegistry.js';

describe('Tool Description Quality Standards', () => {
  const tools = getAllTools();
  const mapboxApiTools = tools.filter(
    (t) =>
      t.name !== 'version_tool' &&
      t.name !== 'resource_reader_tool' &&
      t.name !== 'category_list_tool' // Deprecated tool
  );

  describe('Minimum quality thresholds', () => {
    test.each(mapboxApiTools)(
      '$name has comprehensive description (>200 chars)',
      (tool) => {
        expect(tool.description.length).toBeGreaterThan(200);
      }
    );

    test.each(mapboxApiTools)(
      '$name includes use cases or "when to use" guidance',
      (tool) => {
        const desc = tool.description.toLowerCase();
        const hasUseCases =
          desc.includes('common use cases:') ||
          desc.includes('use this when:') ||
          desc.includes('use cases:');

        expect(hasUseCases).toBe(true);
      }
    );

    test.each(mapboxApiTools)(
      '$name includes context about what it returns',
      (tool) => {
        const desc = tool.description.toLowerCase();
        const hasReturns =
          desc.includes('returns') ||
          desc.includes('output') ||
          desc.includes('provides');

        expect(hasReturns).toBe(true);
      }
    );
  });

  describe('Semantic richness for RAG', () => {
    test.each(mapboxApiTools)(
      '$name has multiple semantic concepts (>5 phrases)',
      (tool) => {
        // Count phrases by splitting on common separators
        const phrases = tool.description
          .split(/[.,;:\n-]/)
          .filter((p) => p.trim().length > 10);
        expect(phrases.length).toBeGreaterThan(5);
      }
    );

    test.each(mapboxApiTools)(
      '$name includes examples or specific scenarios',
      (tool) => {
        const desc = tool.description.toLowerCase();
        // Should have quotes (examples) or specific terminology
        const hasExamples =
          desc.includes('"') ||
          desc.includes('e.g.') ||
          desc.includes('such as') ||
          desc.includes('for example') ||
          /:\s+-\s+/.test(desc); // Bulleted list pattern

        expect(hasExamples).toBe(true);
      }
    );
  });

  describe('Tool-specific keywords', () => {
    test('search_and_geocode_tool includes geocoding keywords', () => {
      const tool = tools.find((t) => t.name === 'search_and_geocode_tool');
      const desc = tool!.description.toLowerCase();

      // Should include key geocoding terms
      expect(desc).toMatch(/geocod|coordinate|latitude|longitude|address/);
    });

    test('directions_tool includes routing/navigation keywords', () => {
      const tool = tools.find((t) => t.name === 'directions_tool');
      const desc = tool!.description.toLowerCase();

      // Should include key routing terms
      expect(desc).toMatch(
        /route|routing|navigation|directions|turn-by-turn|eta/
      );
    });

    test('category_search_tool includes category/type keywords', () => {
      const tool = tools.find((t) => t.name === 'category_search_tool');
      const desc = tool!.description.toLowerCase();

      // Should include category examples
      expect(desc).toMatch(
        /restaurant|hotel|gas station|coffee|pharmacy|hospital/
      );
    });

    test('isochrone_tool includes reachability keywords', () => {
      const tool = tools.find((t) => t.name === 'isochrone_tool');
      const desc = tool!.description.toLowerCase();

      // Should include reachability concepts
      expect(desc).toMatch(/reachab|coverage|service area|accessible/);
    });

    test('matrix_tool includes optimization keywords', () => {
      const tool = tools.find((t) => t.name === 'matrix_tool');
      const desc = tool!.description.toLowerCase();

      // Should include logistics/optimization terms
      expect(desc).toMatch(
        /matrix|many-to-many|logistics|optimization|multiple/
      );
    });

    test('reverse_geocode_tool includes address lookup keywords', () => {
      const tool = tools.find((t) => t.name === 'reverse_geocode_tool');
      const desc = tool!.description.toLowerCase();

      // Should include reverse geocoding concepts
      expect(desc).toMatch(
        /reverse|coordinates to address|postal code|zip code/
      );
    });

    test('static_map_image_tool includes visualization keywords', () => {
      const tool = tools.find((t) => t.name === 'static_map_image_tool');
      const desc = tool!.description.toLowerCase();

      // Should include static image concepts
      expect(desc).toMatch(/static|image|snapshot|thumbnail|url|visual/);
    });
  });

  describe('Related tools guidance', () => {
    test('search tools reference each other appropriately', () => {
      const searchTool = tools.find(
        (t) => t.name === 'search_and_geocode_tool'
      );
      const categoryTool = tools.find((t) => t.name === 'category_search_tool');

      // search_and_geocode_tool should mention category_search_tool
      expect(searchTool!.description.toLowerCase()).toContain(
        'category_search'
      );

      // category_search_tool should mention search_and_geocode_tool
      expect(categoryTool!.description.toLowerCase()).toContain(
        'search_and_geocode'
      );
    });

    test('geocoding tools reference each other', () => {
      const searchTool = tools.find(
        (t) => t.name === 'search_and_geocode_tool'
      );
      const reverseTool = tools.find((t) => t.name === 'reverse_geocode_tool');

      // Should cross-reference for forward/reverse geocoding
      expect(reverseTool!.description.toLowerCase()).toContain(
        'search_and_geocode'
      );
    });

    test('routing tools reference each other', () => {
      const directionsTool = tools.find((t) => t.name === 'directions_tool');
      const matrixTool = tools.find((t) => t.name === 'matrix_tool');
      const isochroneTool = tools.find((t) => t.name === 'isochrone_tool');

      const directionsDesc = directionsTool!.description.toLowerCase();
      const matrixDesc = matrixTool!.description.toLowerCase();

      // Directions should reference matrix or isochrone
      expect(
        directionsDesc.includes('matrix') ||
          directionsDesc.includes('isochrone')
      ).toBe(true);

      // Matrix should reference directions or isochrone
      expect(
        matrixDesc.includes('directions') || matrixDesc.includes('isochrone')
      ).toBe(true);
    });
  });
});
