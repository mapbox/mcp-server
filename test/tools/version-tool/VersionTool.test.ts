// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MockedFunction } from 'vitest';
import { getVersionInfo } from '../../../src/utils/versionUtils.js';
import { VersionTool } from '../../../src/tools/version-tool/VersionTool.js';

vi.mock('../../../src/utils/versionUtils.js', () => ({
  getVersionInfo: vi.fn(() => ({
    name: 'Test MCP Server',
    version: '1.0.0',
    sha: 'abc123',
    tag: 'v1.0.0',
    branch: 'main'
  }))
}));

const mockGetVersionInfo = getVersionInfo as MockedFunction<
  typeof getVersionInfo
>;

describe('VersionTool', () => {
  let tool: VersionTool;

  beforeEach(() => {
    tool = new VersionTool();
  });

  describe('run', () => {
    it('should return version information', async () => {
      const result = await tool.run({});

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);

      // Best approach: exact match with template literal for readability and precision
      const expectedText = `MCP Server Version Information:
- Name: Test MCP Server
- Version: 1.0.0
- SHA: abc123
- Tag: v1.0.0
- Branch: main`;
      expect(result.content[0]).toEqual({
        type: 'text',
        text: expectedText
      });

      // Verify structured content is included
      expect(result.structuredContent).toBeDefined();
      expect(result.structuredContent).toEqual({
        name: 'Test MCP Server',
        version: '1.0.0',
        sha: 'abc123',
        tag: 'v1.0.0',
        branch: 'main'
      });
    });

    it('should handle fallback version info correctly', async () => {
      // Mock getVersionInfo to return fallback values (which is realistic behavior)
      mockGetVersionInfo.mockImplementationOnce(() => ({
        name: 'Mapbox MCP server',
        version: '0.0.0',
        sha: 'unknown',
        tag: 'unknown',
        branch: 'unknown'
      }));

      const result = await tool.run({});

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(
        (result.content[0] as { type: 'text'; text: string }).text
      ).toContain('Version: 0.0.0');
      expect(
        (result.content[0] as { type: 'text'; text: string }).text
      ).toContain('SHA: unknown');
      expect(result.structuredContent).toEqual({
        name: 'Mapbox MCP server',
        version: '0.0.0',
        sha: 'unknown',
        tag: 'unknown',
        branch: 'unknown'
      });
    });
  });

  describe('properties', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('version_tool');
    });

    it('should have correct description', () => {
      expect(tool.description).toBe(
        'Get the current version information of the MCP server'
      );
    });
  });
});
