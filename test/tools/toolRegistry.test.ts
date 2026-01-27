// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { getCoreTools, getAllTools } from '../../src/tools/toolRegistry.js';

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

    it('should include resource_reader_tool in core tools', () => {
      const coreTools = getCoreTools();
      const toolNames = coreTools.map((tool) => tool.name);

      // ResourceReaderTool is in core since we can't reliably detect resource support
      expect(toolNames).toContain('resource_reader_tool');
    });

    it('should have all expected tools (21 total)', () => {
      const coreTools = getCoreTools();
      expect(coreTools.length).toBe(21);
    });
  });

  describe('getAllTools', () => {
    it('should return all tools combined', () => {
      const allTools = getAllTools();
      const coreTools = getCoreTools();

      // Currently all tools are in core
      expect(allTools.length).toBe(coreTools.length);
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
      expect(toolNames).toContain('resource_reader_tool');
      expect(toolNames).toContain('directions_tool');
    });
  });

  describe('Tool categorization consistency', () => {
    it('should have all tools in a single category', () => {
      const coreTools = getCoreTools();
      const allTools = getAllTools();

      // Currently all tools are in CORE_TOOLS
      expect(coreTools.length).toBe(allTools.length);
    });
  });
});
