// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Description Baseline Metrics
 *
 * This test captures baseline metrics for tool descriptions to prevent
 * regressions over time. If descriptions get shorter or lose quality,
 * these tests will catch it.
 *
 * Baseline established after implementing RAG-optimized descriptions.
 */

import { describe, test, expect } from 'vitest';
import { getAllTools } from '../../src/tools/toolRegistry.js';

interface DescriptionMetrics {
  name: string;
  length: number;
  hasUseCases: boolean;
  hasRelatedTools: boolean;
  hasExamples: boolean;
  phraseCount: number;
  wordCount: number;
}

function analyzeDescription(
  toolName: string,
  description: string
): DescriptionMetrics {
  const desc = description.toLowerCase();

  return {
    name: toolName,
    length: description.length,
    hasUseCases:
      desc.includes('common use cases:') ||
      desc.includes('use this when:') ||
      desc.includes('use cases:'),
    hasRelatedTools: desc.includes('related tools:'),
    hasExamples:
      desc.includes('"') ||
      desc.includes('e.g.') ||
      desc.includes('such as') ||
      /:\s+-\s+/.test(desc),
    phraseCount: description
      .split(/[.,;:\n-]/)
      .filter((p) => p.trim().length > 10).length,
    wordCount: description.split(/\s+/).length
  };
}

describe('Description Baseline Metrics', () => {
  const tools = getAllTools();
  const mapboxApiTools = tools.filter(
    (t) =>
      t.name !== 'version_tool' &&
      t.name !== 'resource_reader_tool' &&
      t.name !== 'category_list_tool' // Deprecated tool
  );

  describe('Overall quality baseline', () => {
    test('all Mapbox API tools meet minimum quality thresholds', () => {
      const metrics = mapboxApiTools.map((tool) =>
        analyzeDescription(tool.name, tool.description)
      );

      metrics.forEach((m) => {
        // All tools should have substantial descriptions
        expect(m.length).toBeGreaterThan(200);
        expect(m.wordCount).toBeGreaterThan(30);
        expect(m.phraseCount).toBeGreaterThan(5);

        // All tools should have use cases
        expect(m.hasUseCases).toBe(true);

        // All tools should have examples
        expect(m.hasExamples).toBe(true);
      });
    });

    test('average description length is maintained', () => {
      const totalLength = mapboxApiTools.reduce(
        (sum, tool) => sum + tool.description.length,
        0
      );
      const avgLength = totalLength / mapboxApiTools.length;

      // Average should be at least 500 characters (allows for some shorter tools)
      expect(avgLength).toBeGreaterThan(500);

      console.log(`Average description length: ${avgLength.toFixed(0)} chars`);
    });
  });

  describe('Individual tool baselines', () => {
    // Baseline metrics established 2025-12-16 after RAG optimization
    const baselines: Record<
      string,
      { minLength: number; minWords: number; minPhrases: number }
    > = {
      search_and_geocode_tool: {
        minLength: 800,
        minWords: 120,
        minPhrases: 15
      },
      directions_tool: {
        minLength: 900,
        minWords: 130,
        minPhrases: 18
      },
      category_search_tool: {
        minLength: 700,
        minWords: 110,
        minPhrases: 15
      },
      isochrone_tool: {
        minLength: 550,
        minWords: 80,
        minPhrases: 10
      },
      matrix_tool: {
        minLength: 850,
        minWords: 120,
        minPhrases: 16
      },
      reverse_geocode_tool: {
        minLength: 750,
        minWords: 110,
        minPhrases: 14
      },
      static_map_image_tool: {
        minLength: 900,
        minWords: 130,
        minPhrases: 18
      }
    };

    test.each(Object.entries(baselines))(
      '%s maintains baseline metrics',
      (toolName, baseline) => {
        const tool = tools.find((t) => t.name === toolName);
        expect(tool).toBeDefined();

        const metrics = analyzeDescription(tool!.name, tool!.description);

        // Check against baselines
        expect(metrics.length).toBeGreaterThanOrEqual(baseline.minLength);
        expect(metrics.wordCount).toBeGreaterThanOrEqual(baseline.minWords);
        expect(metrics.phraseCount).toBeGreaterThanOrEqual(baseline.minPhrases);

        // Log actual metrics
        console.log(`${toolName}:`, {
          length: metrics.length,
          words: metrics.wordCount,
          phrases: metrics.phraseCount
        });
      }
    );
  });

  describe('Semantic richness baseline', () => {
    test('descriptions contain diverse vocabulary', () => {
      mapboxApiTools.forEach((tool) => {
        const words = tool.description.toLowerCase().split(/\s+/);
        const uniqueWords = new Set(
          words.filter((w) => w.length > 4) // Filter out short words
        );

        // Should have good vocabulary diversity (at least 40% unique meaningful words)
        const diversityRatio = uniqueWords.size / words.length;
        expect(diversityRatio).toBeGreaterThan(0.4);

        console.log(
          `${tool.name}: ${uniqueWords.size} unique words / ${words.length} total = ${(diversityRatio * 100).toFixed(1)}%`
        );
      });
    });

    test('descriptions include domain-specific terminology', () => {
      const domainTerms = [
        'coordinates',
        'latitude',
        'longitude',
        'geocod',
        'route',
        'navigation',
        'location',
        'address',
        'poi',
        'place',
        'distance',
        'travel',
        'time',
        'map',
        'geojson'
      ];

      mapboxApiTools.forEach((tool) => {
        const desc = tool.description.toLowerCase();
        const termsFound = domainTerms.filter((term) => desc.includes(term));

        // Each tool should use at least 3 domain terms
        expect(termsFound.length).toBeGreaterThanOrEqual(3);
      });
    });
  });

  describe('Structure baseline', () => {
    test('descriptions follow consistent pattern', () => {
      const pattern = {
        hasPrimaryFunction: true, // First sentence describes main function
        hasReturnsInfo: true, // Mentions what it returns
        hasUseCases: true, // Includes use case examples
        hasRelatedTools: false // Optional but recommended
      };

      mapboxApiTools.forEach((tool) => {
        const metrics = analyzeDescription(tool.name, tool.description);

        expect(metrics.hasUseCases).toBe(pattern.hasUseCases);

        // Should mention what it returns
        const desc = tool.description.toLowerCase();
        const hasReturns =
          desc.includes('returns') ||
          desc.includes('output') ||
          desc.includes('provides');
        expect(hasReturns).toBe(pattern.hasReturnsInfo);
      });
    });

    test('no description has regressed to single sentence', () => {
      mapboxApiTools.forEach((tool) => {
        // Count sentences (rough heuristic)
        const sentences = tool.description
          .split(/[.!?]/)
          .filter((s) => s.trim().length > 20);

        // Should have multiple sentences/sections
        expect(sentences.length).toBeGreaterThan(3);
      });
    });
  });

  describe('Cross-references baseline', () => {
    test('related tools reference each other', () => {
      const crossReferences = [
        {
          tool: 'search_and_geocode_tool',
          shouldMention: ['category_search_tool']
        },
        {
          tool: 'category_search_tool',
          shouldMention: ['search_and_geocode_tool']
        },
        {
          tool: 'reverse_geocode_tool',
          shouldMention: ['search_and_geocode_tool']
        },
        {
          tool: 'directions_tool',
          shouldMention: ['matrix_tool', 'isochrone_tool'],
          atLeastOne: true
        },
        {
          tool: 'matrix_tool',
          shouldMention: ['directions_tool', 'isochrone_tool'],
          atLeastOne: true
        }
      ];

      crossReferences.forEach(({ tool, shouldMention, atLeastOne = false }) => {
        const toolObj = tools.find((t) => t.name === tool);
        expect(toolObj).toBeDefined();

        const desc = toolObj!.description.toLowerCase();

        if (atLeastOne) {
          // At least one reference should be present
          const hasReference = shouldMention.some((ref) => desc.includes(ref));
          expect(hasReference).toBe(true);
        } else {
          // All references should be present
          shouldMention.forEach((ref) => {
            expect(desc).toContain(ref);
          });
        }
      });
    });
  });
});
