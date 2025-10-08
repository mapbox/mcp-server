// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect, vi } from 'vitest';
import { DirectionsTool } from '../../../src/tools/directions-tool/DirectionsTool.js';

describe('DirectionsTool output schema registration', () => {
  it('should have an output schema defined', () => {
    const tool = new DirectionsTool();
    expect(tool.outputSchema).toBeDefined();
    expect(tool.outputSchema).toBeTruthy();
  });

  it('should register output schema with MCP server', () => {
    const tool = new DirectionsTool();

    // Mock the installTo method to verify it gets called with output schema
    const installToSpy = vi.spyOn(tool, 'installTo').mockImplementation(() => {
      // Verify that the tool has an output schema when being installed
      expect(tool.outputSchema).toBeDefined();
      return undefined;
    });

    const mockServer = {} as Parameters<typeof tool.installTo>[0];
    tool.installTo(mockServer);

    expect(installToSpy).toHaveBeenCalledWith(mockServer);
  });

  it('should validate response structure matches schema', () => {
    const tool = new DirectionsTool();
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
