import { getAllTools } from './toolRegistry.js';

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

describe('Tool Naming Convention', () => {
  // Dynamically get all tools from the central registry
  const tools = [...getAllTools()];

  function isSnakeCase(str: string): boolean {
    return /^[a-z0-9_]+$/.test(str) && !str.includes('__');
  }

  function endsWithTool(str: string): boolean {
    return str.endsWith('_tool');
  }

  const toolData = tools.map((tool) => ({
    className: tool.constructor.name,
    name: tool.name
  }));

  test.each(toolData)(
    '$className should have snake_case name',
    ({ className, name }) => {
      expect(isSnakeCase(name)).toBe(true);
    }
  );

  test.each(toolData)(
    '$className should have name ending with "_tool"',
    ({ className, name }) => {
      expect(endsWithTool(name)).toBe(true);
    }
  );

  test('all tools should follow both naming conventions', () => {
    const violations = tools
      .filter((tool) => !isSnakeCase(tool.name) || !endsWithTool(tool.name))
      .map((tool) => ({
        className: tool.constructor.name,
        name: tool.name,
        isSnakeCase: isSnakeCase(tool.name),
        endsWithTool: endsWithTool(tool.name)
      }));

    expect(violations).toEqual([]);
  });
});
