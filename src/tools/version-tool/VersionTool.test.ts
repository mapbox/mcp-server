import { getVersionInfo } from '../../utils/versionUtils.js';
import { VersionTool } from './VersionTool';

jest.mock('../../utils/versionUtils.js', () => ({
  getVersionInfo: jest.fn(() => ({
    name: 'Test MCP Server',
    version: '1.0.0',
    sha: 'abc123',
    tag: 'v1.0.0',
    branch: 'main'
  }))
}));

const mockGetVersionInfo = getVersionInfo as jest.MockedFunction<
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

      expect(result.is_error).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Test MCP Server');
      expect(result.content[0].text).toContain('1.0.0');
      expect(result.content[0].text).toContain('abc123');
      expect(result.content[0].text).toContain('v1.0.0');
      expect(result.content[0].text).toContain('main');
    });

    it('should handle errors gracefully', async () => {
      mockGetVersionInfo.mockImplementationOnce(() => {
        throw new Error('Version info not available');
      });

      const result = await tool.run({});

      expect(result.is_error).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
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
