import {
  describe,
  it,
  expect,
  beforeEach,
  afterAll,
  jest
} from '@jest/globals';
import {
  parseToolConfigFromArgs,
  filterTools,
  ToolConfig
} from './toolConfig.js';

// Mock getVersionInfo to avoid import.meta.url issues in Jest
jest.mock('../utils/versionUtils.js', () => ({
  getVersionInfo: jest.fn(() => ({
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
      expect(config).toEqual({});
    });

    it('should parse --enable-tools with single tool', () => {
      process.argv = ['node', 'index.js', '--enable-tools', 'version_tool'];
      const config = parseToolConfigFromArgs();
      expect(config).toEqual({
        enabledTools: ['version_tool']
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
        enabledTools: ['version_tool', 'directions_tool', 'matrix_tool']
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
        enabledTools: ['version_tool', 'directions_tool', 'matrix_tool']
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
        disabledTools: ['static_map_image_tool']
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
        disabledTools: ['static_map_image_tool', 'matrix_tool']
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
        disabledTools: ['matrix_tool']
      });
    });

    it('should handle missing value for --enable-tools', () => {
      process.argv = ['node', 'index.js', '--enable-tools'];
      const config = parseToolConfigFromArgs();
      expect(config).toEqual({});
    });

    it('should handle missing value for --disable-tools', () => {
      process.argv = ['node', 'index.js', '--disable-tools'];
      const config = parseToolConfigFromArgs();
      expect(config).toEqual({});
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
        enabledTools: ['version_tool']
      });
    });
  });

  describe('filterTools', () => {
    // Mock tools for testing
    const mockTools = [
      { name: 'version_tool', description: 'Version tool' },
      { name: 'directions_tool', description: 'Directions tool' },
      { name: 'matrix_tool', description: 'Matrix tool' },
      { name: 'static_map_image_tool', description: 'Static map tool' }
    ] as any;

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
});
