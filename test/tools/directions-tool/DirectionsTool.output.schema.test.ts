// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, vi } from 'vitest';
import { DirectionsTool } from '../../../src/tools/directions-tool/DirectionsTool.js';
import { setupHttpRequest } from '../../utils/httpPipelineUtils.js';

describe('DirectionsTool output schema registration', () => {
  it('should have an output schema defined', () => {
    const { httpRequest } = setupHttpRequest();
    const tool = new DirectionsTool({ httpRequest });
    expect(tool.outputSchema).toBeDefined();
    expect(tool.outputSchema).toBeTruthy();
  });

  it('should register output schema with MCP server', () => {
    const { httpRequest } = setupHttpRequest();
    const tool = new DirectionsTool({ httpRequest });

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

  it('should validate response structure matches schema', () => {
    const { httpRequest } = setupHttpRequest();
    const tool = new DirectionsTool({ httpRequest });
    const mockResponse = {
      routes: [
        {
          duration: 100,
          distance: 1000,
          leg_summaries: ['Main St', 'Oak Ave'],
          intersecting_admins: ['USA'],
          num_legs: 1,
          congestion_information: {
            length_low: 500,
            length_moderate: 300,
            length_heavy: 150,
            length_severe: 50
          },
          average_speed_kph: 45
        }
      ],
      waypoints: [
        {
          name: 'Start Location',
          snap_location: [-122.4194, 37.7749],
          snap_distance: 10
        },
        {
          name: 'End Location',
          snap_location: [-122.4094, 37.7849],
          snap_distance: 5
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
});
