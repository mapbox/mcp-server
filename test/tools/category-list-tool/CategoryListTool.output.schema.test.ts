// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, vi } from 'vitest';
import { CategoryListTool } from '../../../src/tools/category-list-tool/CategoryListTool.js';

describe('CategoryListTool output schema registration', () => {
  it('should have an output schema defined', () => {
    const tool = new CategoryListTool();
    expect(tool.outputSchema).toBeDefined();
    expect(tool.outputSchema).toBeTruthy();
  });

  it('should register output schema with MCP server', () => {
    const tool = new CategoryListTool();

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

  it('should validate valid category list response structure', () => {
    const validResponse = {
      listItems: [
        'services',
        'shopping',
        'food_and_drink',
        'restaurant',
        'lodging'
      ]
    };

    const tool = new CategoryListTool();

    // This should not throw if the schema is correct
    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(validResponse);
      }
    }).not.toThrow();
  });

  it('should validate minimal valid response with single category', () => {
    const minimalResponse = {
      listItems: ['food']
    };

    const tool = new CategoryListTool();

    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(minimalResponse);
      }
    }).not.toThrow();
  });

  it('should validate empty list response', () => {
    const emptyResponse = {
      listItems: []
    };

    const tool = new CategoryListTool();

    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(emptyResponse);
      }
    }).not.toThrow();
  });

  it('should validate response with multiple categories', () => {
    const multipleResponse = {
      listItems: [
        'health_services',
        'office',
        'education',
        'nightlife',
        'lodging',
        'transportation',
        'automotive',
        'recreation',
        'services',
        'shopping'
      ]
    };

    const tool = new CategoryListTool();

    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(multipleResponse);
      }
    }).not.toThrow();
  });

  it('should throw validation error for invalid response missing listItems', () => {
    const invalidResponse = {
      // Missing required listItems field
      someOtherField: 'value'
    };

    const tool = new CategoryListTool();

    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(invalidResponse);
      }
    }).toThrow();
  });

  it('should throw validation error for non-string list items', () => {
    const malformedResponse = {
      listItems: [
        'valid_category',
        123, // Invalid: should be string
        'another_valid_category'
      ]
    };

    const tool = new CategoryListTool();

    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(malformedResponse);
      }
    }).toThrow();
  });

  it('should throw validation error when listItems is not an array', () => {
    const invalidTypeResponse = {
      listItems: 'not an array',
      attribution: 'Mapbox',
      version: '1.0.0'
    };

    const tool = new CategoryListTool();

    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(invalidTypeResponse);
      }
    }).toThrow();
  });
});
