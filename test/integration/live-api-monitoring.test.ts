// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Live API Monitoring Tests
 *
 * These tests make real API calls to detect schema drift and breaking changes.
 * They are skipped in regular CI and run on a daily schedule via GitHub Actions.
 *
 * When failures occur:
 * - A GitHub issue is created automatically
 * - Failing responses are saved to test/failures/ for analysis
 * - Tests log warnings but don't fail the build
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { SearchAndGeocodeTool } from '../../src/tools/search-and-geocode-tool/SearchAndGeocodeTool.js';
import { CategorySearchTool } from '../../src/tools/category-search-tool/CategorySearchTool.js';
import { ReverseGeocodeTool } from '../../src/tools/reverse-geocode-tool/ReverseGeocodeTool.js';
import { SearchBoxResponseSchema } from '../../src/tools/search-and-geocode-tool/SearchAndGeocodeTool.output.schema.js';
import { CategorySearchResponseSchema } from '../../src/tools/category-search-tool/CategorySearchTool.output.schema.js';
import { ReverseGeocodeResponseSchema } from '../../src/tools/reverse-geocode-tool/ReverseGeocodeTool.output.schema.js';
import { httpRequest } from '../../src/utils/httpPipeline.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

interface ValidationFailure {
  tool: string;
  query: string | Record<string, unknown>;
  error: string;
  response: unknown;
  timestamp: string;
}

// Skip these tests by default - only run when explicitly enabled
const skipInCI = !process.env.RUN_API_MONITORING;

// Ensure failures directory exists
const failuresDir = path.join(process.cwd(), 'test/failures');

beforeAll(async () => {
  if (!skipInCI) {
    try {
      await fs.mkdir(failuresDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }
});

describe('Live API Monitoring', () => {
  describe.skipIf(skipInCI)('SearchAndGeocodeTool', () => {
    const tool = new SearchAndGeocodeTool({ httpRequest });

    const testQueries = [
      'Starbucks',
      'Tokyo',
      '1600 Pennsylvania Avenue',
      'Mount Everest',
      'coffee shop',
      'restaurant near times square'
    ];

    it('should handle current Mapbox Search Box API responses', async () => {
      const failures: ValidationFailure[] = [];

      for (const query of testQueries) {
        try {
          console.log(`Testing query: ${query}`);
          const result = await tool.run({ q: query });

          // Check for tool errors
          if (result.isError) {
            failures.push({
              tool: 'search_and_geocode',
              query,
              error: 'Tool returned isError=true',
              response: result,
              timestamp: new Date().toISOString()
            });
            continue;
          }

          // Validate against schema
          const validation = SearchBoxResponseSchema.safeParse(
            result.structuredContent
          );

          if (!validation.success) {
            const failure: ValidationFailure = {
              tool: 'search_and_geocode',
              query,
              error: validation.error.message,
              response: result.structuredContent,
              timestamp: new Date().toISOString()
            };
            failures.push(failure);

            // Save problematic response for analysis
            const filename = `search-${Date.now()}-${query.replace(/\s+/g, '-')}.json`;
            await fs.writeFile(
              path.join(failuresDir, filename),
              JSON.stringify(failure, null, 2)
            );
          }
        } catch (error) {
          const failure: ValidationFailure = {
            tool: 'search_and_geocode',
            query,
            error: error instanceof Error ? error.message : String(error),
            response: null,
            timestamp: new Date().toISOString()
          };
          failures.push(failure);

          const filename = `search-error-${Date.now()}.json`;
          await fs.writeFile(
            path.join(failuresDir, filename),
            JSON.stringify(failure, null, 2)
          );
        }
      }

      // Report all failures
      if (failures.length > 0) {
        console.error('Schema validation failures detected:');
        console.error(JSON.stringify(failures, null, 2));
      }

      // Soft assertion - log but allow to pass if we have warnings
      // The GitHub Action will create an issue regardless
      expect(failures).toHaveLength(0);
    }, 60000); // 60s timeout
  });

  describe.skipIf(skipInCI)('CategorySearchTool', () => {
    const tool = new CategorySearchTool({ httpRequest });

    const testCategories = [
      'restaurant',
      'coffee',
      'hotel',
      'gas_station',
      'parking'
    ];

    it('should handle current Mapbox Category Search API responses', async () => {
      const failures: ValidationFailure[] = [];

      for (const category of testCategories) {
        try {
          console.log(`Testing category: ${category}`);
          const result = await tool.run({
            category,
            limit: 5
          });

          if (result.isError) {
            failures.push({
              tool: 'category_search',
              query: { category },
              error: 'Tool returned isError=true',
              response: result,
              timestamp: new Date().toISOString()
            });
            continue;
          }

          const validation = CategorySearchResponseSchema.safeParse(
            result.structuredContent
          );

          if (!validation.success) {
            const failure: ValidationFailure = {
              tool: 'category_search',
              query: { category },
              error: validation.error.message,
              response: result.structuredContent,
              timestamp: new Date().toISOString()
            };
            failures.push(failure);

            const filename = `category-${Date.now()}-${category}.json`;
            await fs.writeFile(
              path.join(failuresDir, filename),
              JSON.stringify(failure, null, 2)
            );
          }
        } catch (error) {
          const failure: ValidationFailure = {
            tool: 'category_search',
            query: { category },
            error: error instanceof Error ? error.message : String(error),
            response: null,
            timestamp: new Date().toISOString()
          };
          failures.push(failure);

          const filename = `category-error-${Date.now()}.json`;
          await fs.writeFile(
            path.join(failuresDir, filename),
            JSON.stringify(failure, null, 2)
          );
        }
      }

      if (failures.length > 0) {
        console.error('Schema validation failures detected:');
        console.error(JSON.stringify(failures, null, 2));
      }

      expect(failures).toHaveLength(0);
    }, 60000);
  });

  describe.skipIf(skipInCI)('ReverseGeocodeTool', () => {
    const tool = new ReverseGeocodeTool({ httpRequest });

    const testCoordinates = [
      { longitude: -122.4194, latitude: 37.7749, name: 'San Francisco' },
      { longitude: 139.6917, latitude: 35.6895, name: 'Tokyo' },
      { longitude: -0.1276, latitude: 51.5074, name: 'London' },
      { longitude: 2.3522, latitude: 48.8566, name: 'Paris' }
    ];

    it('should handle current Mapbox Reverse Geocode API responses', async () => {
      const failures: ValidationFailure[] = [];

      for (const coord of testCoordinates) {
        try {
          console.log(`Testing coordinates: ${coord.name}`);
          const result = await tool.run({
            longitude: coord.longitude,
            latitude: coord.latitude
          });

          if (result.isError) {
            failures.push({
              tool: 'reverse_geocode',
              query: coord,
              error: 'Tool returned isError=true',
              response: result,
              timestamp: new Date().toISOString()
            });
            continue;
          }

          const validation = ReverseGeocodeResponseSchema.safeParse(
            result.structuredContent
          );

          if (!validation.success) {
            const failure: ValidationFailure = {
              tool: 'reverse_geocode',
              query: coord,
              error: validation.error.message,
              response: result.structuredContent,
              timestamp: new Date().toISOString()
            };
            failures.push(failure);

            const filename = `reverse-${Date.now()}-${coord.name}.json`;
            await fs.writeFile(
              path.join(failuresDir, filename),
              JSON.stringify(failure, null, 2)
            );
          }
        } catch (error) {
          const failure: ValidationFailure = {
            tool: 'reverse_geocode',
            query: coord,
            error: error instanceof Error ? error.message : String(error),
            response: null,
            timestamp: new Date().toISOString()
          };
          failures.push(failure);

          const filename = `reverse-error-${Date.now()}.json`;
          await fs.writeFile(
            path.join(failuresDir, filename),
            JSON.stringify(failure, null, 2)
          );
        }
      }

      if (failures.length > 0) {
        console.error('Schema validation failures detected:');
        console.error(JSON.stringify(failures, null, 2));
      }

      expect(failures).toHaveLength(0);
    }, 60000);
  });
});
