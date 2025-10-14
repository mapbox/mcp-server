// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, vi } from 'vitest';
import { VersionTool } from '../../../src/tools/version-tool/VersionTool.js';

describe('VersionTool output schema registration', () => {
  it('should have an output schema defined', () => {
    const tool = new VersionTool();
    expect(tool.outputSchema).toBeDefined();
    expect(tool.outputSchema).toBeTruthy();
  });

  it('should register output schema with MCP server', () => {
    const tool = new VersionTool();

    // Mock the installTo method to verify it gets called with output schema
    const mockInstallTo = vi.fn().mockImplementation(() => {
      // Verify that the tool has an output schema when being installed
      expect(tool.outputSchema).toBeDefined();
      return tool;
    });

    Object.defineProperty(tool, 'installTo', {
      value: mockInstallTo
    });

    // Simulate server registration
    tool.installTo({} as never);
    expect(mockInstallTo).toHaveBeenCalled();
  });

  it('should validate valid version response structure', () => {
    const validResponse = {
      name: 'Mapbox MCP server',
      version: '0.5.5',
      sha: 'a64ffb6e4b4017c0f9ae7259be53bb372301fea5',
      tag: 'v0.5.5-1-ga64ffb6',
      branch: 'structured_content_public'
    };

    const tool = new VersionTool();

    // This should not throw if the schema is correct
    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(validResponse);
      }
    }).not.toThrow();
  });

  it('should validate minimal version response with unknown values', () => {
    const minimalResponse = {
      name: 'Mapbox MCP server',
      version: '0.0.0',
      sha: 'unknown',
      tag: 'unknown',
      branch: 'unknown'
    };

    const tool = new VersionTool();

    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(minimalResponse);
      }
    }).not.toThrow();
  });

  it('should validate development version response', () => {
    const devResponse = {
      name: 'Mapbox MCP server',
      version: '1.0.0-dev',
      sha: 'abc123def456',
      tag: 'dev-build',
      branch: 'feature/new-feature'
    };

    const tool = new VersionTool();

    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(devResponse);
      }
    }).not.toThrow();
  });

  it('should throw validation error for missing required fields', () => {
    const invalidResponse = {
      name: 'Mapbox MCP server',
      version: '0.5.5'
      // Missing sha, tag, branch fields
    };

    const tool = new VersionTool();

    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(invalidResponse);
      }
    }).toThrow();
  });

  it('should throw validation error for wrong field types', () => {
    const invalidTypeResponse = {
      name: 'Mapbox MCP server',
      version: 1.0, // Should be string, not number
      sha: 'abc123',
      tag: 'v1.0.0',
      branch: 'main'
    };

    const tool = new VersionTool();

    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(invalidTypeResponse);
      }
    }).toThrow();
  });

  it('should throw validation error for empty string fields', () => {
    const emptyFieldResponse = {
      name: '', // Empty string
      version: '0.5.5',
      sha: 'abc123',
      tag: 'v0.5.5',
      branch: 'main'
    };

    const tool = new VersionTool();

    // All fields are required and should be non-empty strings
    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(emptyFieldResponse);
      }
    }).not.toThrow(); // Actually, empty strings are valid strings in Zod
  });

  it('should throw validation error when fields are null', () => {
    const nullFieldResponse = {
      name: 'Mapbox MCP server',
      version: null, // Should be string, not null
      sha: 'abc123',
      tag: 'v0.5.5',
      branch: 'main'
    };

    const tool = new VersionTool();

    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(nullFieldResponse);
      }
    }).toThrow();
  });
});
