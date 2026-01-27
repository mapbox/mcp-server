// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import {
  getCoreTools,
  getElicitationTools,
  getResourceFallbackTools,
  getAllTools
} from '../../src/tools/toolRegistry.js';

describe('Tool Registry', () => {
  describe('getCoreTools', () => {
    it('should return an array of core tools', () => {
      const coreTools = getCoreTools();
      expect(Array.isArray(coreTools)).toBe(true);
      expect(coreTools.length).toBeGreaterThan(0);
    });

    it('should include expected core tools', () => {
      const coreTools = getCoreTools();
      const toolNames = coreTools.map((tool) => tool.name);

      // Verify some expected core tools
      expect(toolNames).toContain('distance_tool');
      expect(toolNames).toContain('search_and_geocode_tool');
      expect(toolNames).toContain('directions_tool');
      expect(toolNames).toContain('category_search_tool');
    });

    it('should not include resource fallback tools', () => {
      const coreTools = getCoreTools();
      const toolNames = coreTools.map((tool) => tool.name);

      // Resource fallback tools should not be in core
      expect(toolNames).not.toContain('resource_reader_tool');
      expect(toolNames).not.toContain('category_list_tool');
    });
  });

  describe('getElicitationTools', () => {
    it('should return an array of elicitation tools', () => {
      const elicitationTools = getElicitationTools();
      expect(Array.isArray(elicitationTools)).toBe(true);
    });

    it('should currently be empty (elicitation support pending)', () => {
      const elicitationTools = getElicitationTools();
      expect(elicitationTools.length).toBe(0);
    });

    it('should be ready for future elicitation-dependent tools', () => {
      // This test documents that the infrastructure is in place
      // When elicitation support is added, tools can be moved here
      const elicitationTools = getElicitationTools();
      expect(Array.isArray(elicitationTools)).toBe(true);
    });
  });

  describe('getResourceFallbackTools', () => {
    it('should return an array of resource fallback tools', () => {
      const resourceFallbackTools = getResourceFallbackTools();
      expect(Array.isArray(resourceFallbackTools)).toBe(true);
      expect(resourceFallbackTools.length).toBe(2);
    });

    it('should include resource_reader_tool', () => {
      const resourceFallbackTools = getResourceFallbackTools();
      const toolNames = resourceFallbackTools.map((tool) => tool.name);
      expect(toolNames).toContain('resource_reader_tool');
    });

    it('should include category_list_tool', () => {
      const resourceFallbackTools = getResourceFallbackTools();
      const toolNames = resourceFallbackTools.map((tool) => tool.name);
      expect(toolNames).toContain('category_list_tool');
    });
  });

  describe('getAllTools', () => {
    it('should return all tools combined', () => {
      const allTools = getAllTools();
      const coreTools = getCoreTools();
      const elicitationTools = getElicitationTools();
      const resourceFallbackTools = getResourceFallbackTools();

      expect(allTools.length).toBe(
        coreTools.length +
          elicitationTools.length +
          resourceFallbackTools.length
      );
    });

    it('should have no duplicate tools', () => {
      const allTools = getAllTools();
      const toolNames = allTools.map((tool) => tool.name);
      const uniqueToolNames = new Set(toolNames);

      expect(toolNames.length).toBe(uniqueToolNames.size);
    });

    it('should include tools from all categories', () => {
      const allTools = getAllTools();
      const toolNames = allTools.map((tool) => tool.name);

      // Core tools
      expect(toolNames).toContain('distance_tool');
      expect(toolNames).toContain('directions_tool');
      // Resource fallback tools
      expect(toolNames).toContain('resource_reader_tool');
      expect(toolNames).toContain('category_list_tool');
      // Note: No elicitation tools yet (empty array)
    });
  });

  describe('Tool categorization consistency', () => {
    it('should have no overlap between core and elicitation tools', () => {
      const coreToolNames = getCoreTools().map((tool) => tool.name);
      const elicitationToolNames = getElicitationTools().map(
        (tool) => tool.name
      );

      const overlap = coreToolNames.filter((name) =>
        elicitationToolNames.includes(name)
      );
      expect(overlap).toEqual([]);
    });

    it('should have no overlap between core and resource fallback tools', () => {
      const coreToolNames = getCoreTools().map((tool) => tool.name);
      const resourceFallbackToolNames = getResourceFallbackTools().map(
        (tool) => tool.name
      );

      const overlap = coreToolNames.filter((name) =>
        resourceFallbackToolNames.includes(name)
      );
      expect(overlap).toEqual([]);
    });

    it('should have no overlap between elicitation and resource fallback tools', () => {
      const elicitationToolNames = getElicitationTools().map(
        (tool) => tool.name
      );
      const resourceFallbackToolNames = getResourceFallbackTools().map(
        (tool) => tool.name
      );

      const overlap = elicitationToolNames.filter((name) =>
        resourceFallbackToolNames.includes(name)
      );
      expect(overlap).toEqual([]);
    });
  });
});
