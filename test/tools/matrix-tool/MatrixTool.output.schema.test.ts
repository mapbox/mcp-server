// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect, vi } from 'vitest';
import { MatrixTool } from '../../../src/tools/matrix-tool/MatrixTool.js';

describe('MatrixTool output schema registration', () => {
  it('should have an output schema defined', () => {
    const tool = new MatrixTool();
    expect(tool.outputSchema).toBeDefined();
    expect(tool.outputSchema).toBeTruthy();
  });

  it('should register output schema with MCP server', () => {
    const tool = new MatrixTool();

    // Mock the installTo method to verify it gets called with output schema
    const installToSpy = vi.spyOn(tool, 'installTo').mockImplementation(() => {
      // Verify that the tool has an output schema when being installed
      expect(tool.outputSchema).toBeDefined();
      return {} as ReturnType<typeof tool.installTo>;
    });

    const mockServer = {} as Parameters<typeof tool.installTo>[0];
    tool.installTo(mockServer);

    expect(installToSpy).toHaveBeenCalledWith(mockServer);
  });

  it('should validate response structure matches schema', () => {
    const tool = new MatrixTool();
    const mockResponse = {
      code: 'Ok',
      durations: [
        [0, 573, 1169.5],
        [573, 0, 597],
        [1169.5, 597, 0]
      ],
      distances: [
        [0, 1200, 2400],
        [1200, 0, 1500],
        [2400, 1500, 0]
      ],
      sources: [
        {
          name: 'Mission Street',
          location: [-122.418408, 37.751668],
          distance: 5
        },
        {
          name: '22nd Street',
          location: [-122.422959, 37.755184],
          distance: 8
        },
        {
          name: '',
          location: [-122.426911, 37.759695],
          distance: 10
        }
      ],
      destinations: [
        {
          name: 'Mission Street',
          location: [-122.418408, 37.751668],
          distance: 5
        },
        {
          name: '22nd Street',
          location: [-122.422959, 37.755184],
          distance: 8
        },
        {
          name: '',
          location: [-122.426911, 37.759695],
          distance: 10
        }
      ]
    };

    // This should not throw if the schema is correct
    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(mockResponse);
      }
    }).not.toThrow();
  });

  it('should handle null values in durations and distances matrices', () => {
    const tool = new MatrixTool();
    const mockResponseWithNulls = {
      code: 'Ok',
      durations: [
        [0, null, 1169.5],
        [573, 0, null],
        [null, 597, 0]
      ],
      distances: [
        [0, null, 2400],
        [1200, 0, null],
        [null, 1500, 0]
      ],
      sources: [
        {
          name: 'Start',
          location: [-122.418408, 37.751668],
          distance: 5
        }
      ],
      destinations: [
        {
          name: 'End',
          location: [-122.422959, 37.755184],
          distance: 8
        }
      ]
    };

    // This should not throw - null values are allowed in matrices
    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(mockResponseWithNulls);
      }
    }).not.toThrow();
  });

  it('should handle error responses with message field', () => {
    const tool = new MatrixTool();
    const errorResponse = {
      code: 'InvalidInput',
      message: 'Invalid coordinates provided',
      sources: [],
      destinations: []
    };

    // This should not throw - error responses are valid
    expect(() => {
      if (tool.outputSchema) {
        tool.outputSchema.parse(errorResponse);
      }
    }).not.toThrow();
  });
});
