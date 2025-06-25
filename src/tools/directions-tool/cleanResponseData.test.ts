import { cleanResponseData } from './cleanResponseData.js';

describe('cleanResponseData', () => {
  // Create a complete mock input that satisfies the DirectionsInputSchema
  const mockInput = {
    coordinates: [
      [0, 0],
      [1, 1]
    ] as [number, number][], // Use a proper tuple type
    routing_profile: 'driving-traffic' as const,
    geometries: 'none' as const,
    alternatives: false
  };

  it('should remove unnecessary keys', () => {
    const mockData = {
      uuid: '12345',
      code: 'Ok',
      routes: []
    };

    const result = cleanResponseData(mockInput, mockData);
    expect(result.uuid).toBeUndefined();
    expect(result.code).toBeUndefined();
  });

  it('should rename waypoint location and distance properties', () => {
    const mockData = {
      waypoints: [
        {
          name: 'Test',
          location: [-73.989, 40.733],
          distance: 10.5
        }
      ],
      routes: []
    };

    const result = cleanResponseData(mockInput, mockData);
    expect(result.waypoints[0].location).toBeUndefined();
    expect(result.waypoints[0].snap_location).toEqual([-73.989, 40.733]);
    expect(result.waypoints[0].distance).toBeUndefined();
    expect(result.waypoints[0].snap_distance).toBe(11); // Rounded from 10.5
  });

  it('should round duration and distance', () => {
    const mockData = {
      routes: [
        {
          duration: 1234.56,
          distance: 5678.91,
          legs: []
        }
      ]
    };

    const result = cleanResponseData(mockInput, mockData);
    expect(result.routes[0].duration).toBe(1235);
    expect(result.routes[0].distance).toBe(5679);
  });

  it('should delete geometry when geometries is set to none', () => {
    const mockData = {
      routes: [
        {
          geometry: 'someGeometryData',
          legs: []
        }
      ]
    };

    const result = cleanResponseData(mockInput, mockData);
    expect(result.routes[0].geometry).toBeUndefined();
  });

  it('should keep geometry when geometries is not none', () => {
    const mockData = {
      routes: [
        {
          geometry: 'someGeometryData',
          legs: []
        }
      ]
    };

    // Override just the geometries property for this test
    const geojsonInput = {
      ...mockInput,
      geometries: 'geojson' as const
    };

    const result = cleanResponseData(geojsonInput, mockData);
    expect(result.routes[0].geometry).toBe('someGeometryData');
  });

  it('should process route data correctly', () => {
    const mockData = {
      routes: [
        {
          duration: 1200,
          distance: 5000,
          weight_name: 'routingWeight',
          weight: 1500,
          duration_typical: 1300,
          weight_typical: 1600,
          legs: [
            {
              summary: 'First leg summary',
              admins: [{ iso_3166_1_alpha3: 'USA' }],
              steps: []
            },
            {
              summary: 'Second leg summary',
              admins: [{ iso_3166_1_alpha3: 'CAN' }],
              steps: []
            }
          ]
        }
      ]
    };

    const result = cleanResponseData(mockInput, mockData);

    // Check if data is properly processed
    expect(result.routes[0].weight_name).toBeUndefined();
    expect(result.routes[0].weight).toBeUndefined();
    expect(result.routes[0].leg_summaries).toEqual([
      'First leg summary',
      'Second leg summary'
    ]);
    expect(result.routes[0].duration_typical).toBeUndefined();
    expect(result.routes[0].duration_under_typical_traffic_conditions).toBe(
      1300
    );
    expect(result.routes[0].weight_typical).toBeUndefined();
    expect(result.routes[0].intersecting_admins).toEqual(['USA', 'CAN']);
    expect(result.routes[0].num_legs).toBe(2);
    expect(result.routes[0].legs).toBeUndefined();
  });

  it('should handle notifications and collect unique messages', () => {
    const mockData = {
      routes: [
        {
          legs: [
            {
              notifications: [
                { details: { message: 'Traffic ahead' } },
                { details: { message: 'Road closure' } }
              ],
              summary: 'Leg 1'
            },
            {
              notifications: [
                { details: { message: 'Traffic ahead' } },
                { details: { message: 'Construction zone' } }
              ],
              summary: 'Leg 2'
            }
          ]
        }
      ]
    };

    const result = cleanResponseData(mockInput, mockData);

    expect(result.routes[0].notifications_summary).toEqual([
      'Traffic ahead',
      'Road closure',
      'Construction zone'
    ]);
  });

  it('should process incidents information', () => {
    const mockData = {
      routes: [
        {
          legs: [
            {
              incidents: [
                {
                  type: 'accident',
                  end_time: '2023-05-01T12:00:00Z',
                  long_description: 'Multiple vehicle collision',
                  impact: 'severe',
                  affected_road_names: ['Main St'],
                  length: 500,
                  extra_field: 'should not be included'
                }
              ],
              summary: 'Leg with incident'
            }
          ]
        }
      ]
    };

    const result = cleanResponseData(mockInput, mockData);

    expect(result.routes[0].incidents_summary).toHaveLength(1);
    expect(result.routes[0].incidents_summary[0]).toEqual({
      type: 'accident',
      end_time: '2023-05-01T12:00:00Z',
      long_description: 'Multiple vehicle collision',
      impact: 'severe',
      affected_road_names: ['Main St'],
      length: 500
    });
    expect(result.routes[0].incidents_summary[0].extra_field).toBeUndefined();
  });

  it('should collect voice instructions when within limits', () => {
    const mockData = {
      routes: [
        {
          legs: [
            {
              steps: [
                {
                  voiceInstructions: [
                    { announcement: 'Turn right in 100 meters' },
                    { announcement: 'Turn right now' }
                  ]
                },
                {
                  voiceInstructions: [
                    { announcement: 'Continue straight for 500 meters' }
                  ]
                }
              ],
              summary: 'Leg with voice instructions'
            }
          ]
        }
      ]
    };

    const result = cleanResponseData(mockInput, mockData);

    expect(result.routes[0].instructions).toEqual([
      'Turn right in 100 meters',
      'Turn right now',
      'Continue straight for 500 meters'
    ]);
  });

  it('should not include instructions when there are too many', () => {
    const mockData = {
      routes: [
        {
          legs: [
            {
              steps: Array(6)
                .fill(0)
                .map(() => ({
                  voiceInstructions: [
                    { announcement: 'Instruction 1' },
                    { announcement: 'Instruction 2' }
                  ]
                })),
              summary: 'Leg with many instructions'
            }
          ]
        }
      ]
    };

    const result = cleanResponseData(mockInput, mockData);

    // With 6 steps and 2 instructions each, we'd have 12 instructions total
    // The function should exclude them since it's > 10
    expect(result.routes[0].instructions).toBeUndefined();
  });

  it('should calculate congestion information correctly', () => {
    const mockData = {
      routes: [
        {
          legs: [
            {
              annotation: {
                congestion: ['severe', 'heavy', 'moderate', 'low', 'unknown'],
                distance: [100, 200, 300, 400, 500]
              },
              summary: 'Leg with congestion'
            }
          ]
        }
      ]
    };

    const result = cleanResponseData(mockInput, mockData);

    expect(result.routes[0].congestion_information).toEqual({
      length_severe: 100,
      length_heavy: 200,
      length_moderate: 300,
      length_low: 400
    });
    // Note: 'unknown' congestion type is skipped
  });

  it('should calculate average speed correctly', () => {
    const mockData = {
      routes: [
        {
          legs: [
            {
              annotation: {
                speed: [10, 20, 30], // m/s
                distance: [100, 200, 300] // meters
              },
              summary: 'Leg with speed data'
            }
          ]
        }
      ]
    };

    const result = cleanResponseData(mockInput, mockData);

    // Calculation:
    // Weighted sum = 10*100 + 20*200 + 30*300 = 1000 + 4000 + 9000 = 14000
    // Total distance = 100 + 200 + 300 = 600
    // Average m/s = 14000/600 = 23.33
    // Average km/h = 23.33 * 3.6 = 84 (rounded)
    expect(result.routes[0].average_speed_kph).toBe(84);
  });
});
