// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  afterAll,
  vi
} from 'vitest';
import type { ToolConfig } from '../../src/config/toolConfig.js';
import {
  parseToolConfigFromArgs,
  filterTools
} from '../../src/config/toolConfig.js';

// Mock getVersionInfo to avoid import.meta.url issues in Vitest
vi.mock('../../../src/utils/versionUtils.js', () => ({
  getVersionInfo: vi.fn(() => ({
    name: 'Mapbox MCP server',
    version: '1.0.0',
    sha: 'mock-sha',
    tag: 'mock-tag',
    branch: 'mock-branch'
  }))
}));

describe('Tool Configuration', () => {
  // Save original argv
  const originalArgv = process.argv;

  beforeEach(() => {
    // Reset argv before each test
    process.argv = [...originalArgv];
  });

  afterAll(() => {
    // Restore original argv
    process.argv = originalArgv;
  });

  describe('parseToolConfigFromArgs', () => {
    it('should return empty config when no arguments provided', () => {
      process.argv = ['node', 'index.js'];
      const config = parseToolConfigFromArgs();
      expect(config).toEqual({ enableMcpUi: true });
    });

    it('should parse --enable-tools with single tool', () => {
      process.argv = ['node', 'index.js', '--enable-tools', 'version_tool'];
      const config = parseToolConfigFromArgs();
      expect(config).toEqual({
        enabledTools: ['version_tool'],
        enableMcpUi: true
      });
    });

    it('should parse --enable-tools with multiple tools', () => {
      process.argv = [
        'node',
        'index.js',
        '--enable-tools',
        'version_tool,directions_tool,matrix_tool'
      ];
      const config = parseToolConfigFromArgs();
      expect(config).toEqual({
        enabledTools: ['version_tool', 'directions_tool', 'matrix_tool'],
        enableMcpUi: true
      });
    });

    it('should trim whitespace from tool names', () => {
      process.argv = [
        'node',
        'index.js',
        '--enable-tools',
        'version_tool , directions_tool , matrix_tool'
      ];
      const config = parseToolConfigFromArgs();
      expect(config).toEqual({
        enabledTools: ['version_tool', 'directions_tool', 'matrix_tool'],
        enableMcpUi: true
      });
    });

    it('should parse --disable-tools with single tool', () => {
      process.argv = [
        'node',
        'index.js',
        '--disable-tools',
        'static_map_image_tool'
      ];
      const config = parseToolConfigFromArgs();
      expect(config).toEqual({
        disabledTools: ['static_map_image_tool'],
        enableMcpUi: true
      });
    });

    it('should parse --disable-tools with multiple tools', () => {
      process.argv = [
        'node',
        'index.js',
        '--disable-tools',
        'static_map_image_tool,matrix_tool'
      ];
      const config = parseToolConfigFromArgs();
      expect(config).toEqual({
        disabledTools: ['static_map_image_tool', 'matrix_tool'],
        enableMcpUi: true
      });
    });

    it('should parse both --enable-tools and --disable-tools', () => {
      process.argv = [
        'node',
        'index.js',
        '--enable-tools',
        'version_tool',
        '--disable-tools',
        'matrix_tool'
      ];
      const config = parseToolConfigFromArgs();
      expect(config).toEqual({
        enabledTools: ['version_tool'],
        disabledTools: ['matrix_tool'],
        enableMcpUi: true
      });
    });

    it('should handle missing value for --enable-tools', () => {
      process.argv = ['node', 'index.js', '--enable-tools'];
      const config = parseToolConfigFromArgs();
      expect(config).toEqual({ enableMcpUi: true });
    });

    it('should handle missing value for --disable-tools', () => {
      process.argv = ['node', 'index.js', '--disable-tools'];
      const config = parseToolConfigFromArgs();
      expect(config).toEqual({ enableMcpUi: true });
    });

    it('should ignore unknown arguments', () => {
      process.argv = [
        'node',
        'index.js',
        '--unknown-arg',
        'value',
        '--enable-tools',
        'version_tool'
      ];
      const config = parseToolConfigFromArgs();
      expect(config).toEqual({
        enabledTools: ['version_tool'],
        enableMcpUi: true
      });
    });
  });

  describe('filterTools', () => {
    // Mock tools for testing
    const mockTools: Array<{ name: string; description: string }> = [
      { name: 'version_tool', description: 'Version tool' },
      { name: 'directions_tool', description: 'Directions tool' },
      { name: 'matrix_tool', description: 'Matrix tool' },
      { name: 'static_map_image_tool', description: 'Static map tool' }
    ];

    it('should return all tools when no config provided', () => {
      const config: ToolConfig = {};
      const filtered = filterTools(mockTools, config);
      expect(filtered).toEqual(mockTools);
    });

    it('should filter tools based on enabledTools', () => {
      const config: ToolConfig = {
        enabledTools: ['version_tool', 'directions_tool']
      };
      const filtered = filterTools(mockTools, config);
      expect(filtered).toHaveLength(2);
      expect(filtered.map((t) => t.name)).toEqual([
        'version_tool',
        'directions_tool'
      ]);
    });

    it('should filter tools based on disabledTools', () => {
      const config: ToolConfig = {
        disabledTools: ['matrix_tool', 'static_map_image_tool']
      };
      const filtered = filterTools(mockTools, config);
      expect(filtered).toHaveLength(2);
      expect(filtered.map((t) => t.name)).toEqual([
        'version_tool',
        'directions_tool'
      ]);
    });

    it('should prioritize enabledTools over disabledTools', () => {
      const config: ToolConfig = {
        enabledTools: ['version_tool'],
        disabledTools: ['version_tool', 'directions_tool']
      };
      const filtered = filterTools(mockTools, config);
      expect(filtered).toHaveLength(1);
      expect(filtered.map((t) => t.name)).toEqual(['version_tool']);
    });

    it('should handle non-existent tool names gracefully', () => {
      const config: ToolConfig = {
        enabledTools: ['version_tool', 'non_existent_tool']
      };
      const filtered = filterTools(mockTools, config);
      expect(filtered).toHaveLength(1);
      expect(filtered.map((t) => t.name)).toEqual(['version_tool']);
    });

    it('should return empty array when enabledTools is empty', () => {
      const config: ToolConfig = {
        enabledTools: []
      };
      const filtered = filterTools(mockTools, config);
      expect(filtered).toHaveLength(0);
    });

    it('should return all tools when disabledTools is empty', () => {
      const config: ToolConfig = {
        disabledTools: []
      };
      const filtered = filterTools(mockTools, config);
      expect(filtered).toEqual(mockTools);
    });
  });

  describe('MCP-UI Configuration', () => {
    afterEach(() => {
      // Clean up environment variables
      delete process.env.ENABLE_MCP_UI;
      // Reset argv to avoid affecting other tests
      process.argv = ['node', 'index.js'];
    });

    it('should default MCP-UI to enabled', () => {
      process.argv = ['node', 'index.js'];
      const config = parseToolConfigFromArgs();
      expect(config.enableMcpUi).toBe(true);
    });

    it('should disable MCP-UI via environment variable', () => {
      process.env.ENABLE_MCP_UI = 'false';
      const config = parseToolConfigFromArgs();
      expect(config.enableMcpUi).toBe(false);
    });

    it('should enable MCP-UI via environment variable', () => {
      process.env.ENABLE_MCP_UI = 'true';
      const config = parseToolConfigFromArgs();
      expect(config.enableMcpUi).toBe(true);
    });

    it('should disable MCP-UI via command-line flag', () => {
      process.argv = ['node', 'index.js', '--disable-mcp-ui'];
      const config = parseToolConfigFromArgs();
      expect(config.enableMcpUi).toBe(false);
    });

    it('should prioritize environment variable over command-line flag', () => {
      process.env.ENABLE_MCP_UI = 'true';
      process.argv = ['node', 'index.js', '--disable-mcp-ui'];
      const config = parseToolConfigFromArgs();
      expect(config.enableMcpUi).toBe(true);
    });
  });
});
