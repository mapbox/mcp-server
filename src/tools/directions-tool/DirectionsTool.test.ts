process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { cleanup } from '../../utils/requestUtils.js';
import {
  setupFetch,
  assertHeadersSent
} from '../../utils/requestUtils.test-helpers.js';
import { DirectionsTool } from './DirectionsTool.js';

describe('DirectionsTool', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    cleanup();
  });

  it('sends custom header', async () => {
    const mockFetch = setupFetch();

    await new DirectionsTool().run({
      coordinates: [
        { longitude: -74.102094, latitude: 40.692815 },
        { longitude: -74.1022094, latitude: 40.792815 }
      ]
    });

    assertHeadersSent(mockFetch);
  });

  it('constructs correct URL with required parameters', async () => {
    const mockFetch = setupFetch();

    await new DirectionsTool().run({
      coordinates: [
        { longitude: -73.989, latitude: 40.733 },
        { longitude: -73.979, latitude: 40.743 }
      ]
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('directions/v5/mapbox/driving-traffic');
    expect(calledUrl).toContain('-73.989%2C40.733%3B-73.979%2C40.743');
    expect(calledUrl).toContain('access_token=');
    assertHeadersSent(mockFetch);
  });

  it('includes all optional parameters in URL', async () => {
    const mockFetch = setupFetch();

    await new DirectionsTool().run({
      coordinates: [
        { longitude: -122.42, latitude: 37.78 },
        { longitude: -122.4, latitude: 37.79 },
        { longitude: -122.39, latitude: 37.77 }
      ],
      routing_profile: 'walking',
      geometries: 'geojson',
      alternatives: true,
      annotations: ['distance', 'duration', 'speed'],
      exclude: 'ferry'
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('directions/v5/mapbox/walking');
    expect(calledUrl).toContain(
      '-122.42%2C37.78%3B-122.4%2C37.79%3B-122.39%2C37.77'
    );
    expect(calledUrl).toContain('geometries=geojson');
    expect(calledUrl).toContain('alternatives=true');
    expect(calledUrl).toContain('annotations=distance%2Cduration%2Cspeed');
    expect(calledUrl).toContain('overview=full');
    expect(calledUrl).toContain('exclude=ferry');
    assertHeadersSent(mockFetch);
  });

  it('uses default parameters when not specified', async () => {
    const mockFetch = setupFetch();

    await new DirectionsTool().run({
      coordinates: [
        { longitude: -118.24, latitude: 34.05 },
        { longitude: -118.3, latitude: 34.02 }
      ]
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('directions/v5/mapbox/driving-traffic');
    expect(calledUrl).toContain('geometries=polyline');
    expect(calledUrl).toContain('alternatives=false');
    expect(calledUrl).not.toContain('annotations=');
    expect(calledUrl).not.toContain('exclude=');
    assertHeadersSent(mockFetch);
  });

  it('handles exclude parameter with point format', async () => {
    const mockFetch = setupFetch();

    await new DirectionsTool().run({
      coordinates: [
        { longitude: -74.0, latitude: 40.7 },
        { longitude: -73.9, latitude: 40.8 }
      ],
      exclude: 'toll,point(-73.95 40.75)'
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    const comma = '%2C';
    const space = '%20';
    const openPar = '%28';
    const closePar = '%29';
    expect(calledUrl).toContain(
      `exclude=toll${comma}point${openPar}-73.95${space}40.75${closePar}`
    );
    assertHeadersSent(mockFetch);
  });

  it('handles fetch errors gracefully', async () => {
    const mockFetch = setupFetch({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    });

    const result = await new DirectionsTool().run({
      coordinates: [
        { longitude: -73.989, latitude: 40.733 },
        { longitude: -73.979, latitude: 40.743 }
      ]
    });

    expect(result.is_error).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: 'Internal error has occurred.'
    });
    assertHeadersSent(mockFetch);
  });

  it('validates coordinates constraints - minimum required', async () => {
    const tool = new DirectionsTool();

    // Test with only one coordinate (invalid)
    await expect(
      tool.run({
        coordinates: [{ longitude: -73.989, latitude: 40.733 }]
      })
    ).resolves.toMatchObject({
      is_error: true
    });

    // Test with zero coordinates (invalid)
    await expect(
      tool.run({
        coordinates: []
      })
    ).resolves.toMatchObject({
      is_error: true
    });
  });

  it('validates coordinates constraints - maximum allowed', async () => {
    const tool = new DirectionsTool();

    // Create an array of 26 coordinates (one more than allowed)
    const tooManyCoords = Array(26).fill({
      longitude: -73.989,
      latitude: 40.733
    });

    await expect(
      tool.run({
        coordinates: tooManyCoords
      })
    ).resolves.toMatchObject({
      is_error: true
    });
  });

  it('successfully processes exactly 2 coordinates (minimum allowed)', async () => {
    const mockFetch = setupFetch();

    await new DirectionsTool().run({
      coordinates: [
        { longitude: -73.989, latitude: 40.733 },
        { longitude: -73.979, latitude: 40.743 }
      ]
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('-73.989%2C40.733%3B-73.979%2C40.743');
    assertHeadersSent(mockFetch);
  });

  it('successfully processes exactly 25 coordinates (maximum allowed)', async () => {
    const mockFetch = setupFetch();

    // Create an array of exactly 25 coordinates (maximum allowed)
    const maxCoords = Array(25)
      .fill(0)
      .map((_, i) => ({ longitude: -74 + i * 0.01, latitude: 40 + i * 0.01 }));

    await new DirectionsTool().run({
      coordinates: maxCoords
    });

    const calledUrl = mockFetch.mock.calls[0][0];

    // Check that all coordinates are properly encoded
    for (let i = 0; i < maxCoords.length; i++) {
      const { longitude: lng, latitude: lat } = maxCoords[i];
      const semicolon = i < 24 ? '%3B' : '';
      const expectedCoord = `${lng}%2C${lat}` + semicolon;
      expect(calledUrl).toContain(expectedCoord);
    }

    assertHeadersSent(mockFetch);
  });

  describe('walking parameters validations', () => {
    it('accepts walking_speed with walking profile', async () => {
      const mockFetch = setupFetch();

      await new DirectionsTool().run({
        coordinates: [
          { longitude: -73.989, latitude: 40.733 },
          { longitude: -73.979, latitude: 40.743 }
        ],
        routing_profile: 'walking',
        walking_speed: 2.5
      });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('walking_speed=2.5');
      assertHeadersSent(mockFetch);
    });

    it('accepts walkway_bias with walking profile', async () => {
      const mockFetch = setupFetch();

      await new DirectionsTool().run({
        coordinates: [
          { longitude: -73.989, latitude: 40.733 },
          { longitude: -73.979, latitude: 40.743 }
        ],
        routing_profile: 'walking',
        walkway_bias: 0.8
      });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('walkway_bias=0.8');
      assertHeadersSent(mockFetch);
    });

    it('rejects walking_speed with non-walking profiles', async () => {
      const tool = new DirectionsTool();

      // Test with driving profile
      await expect(
        tool.run({
          coordinates: [
            { longitude: -73.989, latitude: 40.733 },
            { longitude: -73.979, latitude: 40.743 }
          ],
          routing_profile: 'driving',
          walking_speed: 2.0
        })
      ).resolves.toMatchObject({
        is_error: true
      });

      // Test with cycling profile
      await expect(
        tool.run({
          coordinates: [
            { longitude: -73.989, latitude: 40.733 },
            { longitude: -73.979, latitude: 40.743 }
          ],
          routing_profile: 'cycling',
          walking_speed: 2.0
        })
      ).resolves.toMatchObject({
        is_error: true
      });
    });

    it('rejects walkway_bias with non-walking profiles', async () => {
      const tool = new DirectionsTool();

      // Test with driving-traffic profile
      await expect(
        tool.run({
          coordinates: [
            { longitude: -73.989, latitude: 40.733 },
            { longitude: -73.979, latitude: 40.743 }
          ],
          routing_profile: 'driving-traffic',
          walkway_bias: 0.5
        })
      ).resolves.toMatchObject({
        is_error: true
      });

      // Test with cycling profile
      await expect(
        tool.run({
          coordinates: [
            { longitude: -73.989, latitude: 40.733 },
            { longitude: -73.979, latitude: 40.743 }
          ],
          routing_profile: 'cycling',
          walkway_bias: -0.8
        })
      ).resolves.toMatchObject({
        is_error: true
      });
    });

    it('validates walking_speed value ranges', async () => {
      const tool = new DirectionsTool();

      // Test with value below minimum (0.14 m/s)
      await expect(
        tool.run({
          coordinates: [
            { longitude: -73.989, latitude: 40.733 },
            { longitude: -73.979, latitude: 40.743 }
          ],
          routing_profile: 'walking',
          walking_speed: 0.1
        })
      ).resolves.toMatchObject({
        is_error: true
      });

      // Test with value above maximum (6.94 m/s)
      await expect(
        tool.run({
          coordinates: [
            { longitude: -73.989, latitude: 40.733 },
            { longitude: -73.979, latitude: 40.743 }
          ],
          routing_profile: 'walking',
          walking_speed: 7.5
        })
      ).resolves.toMatchObject({
        is_error: true
      });

      // Test with valid value
      const mockFetch = setupFetch();
      await tool.run({
        coordinates: [
          { longitude: -73.989, latitude: 40.733 },
          { longitude: -73.979, latitude: 40.743 }
        ],
        routing_profile: 'walking',
        walking_speed: 3.0
      });
      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('walking_speed=3');
    });

    it('validates walkway_bias value ranges', async () => {
      const tool = new DirectionsTool();

      // Test with value below minimum (-1)
      await expect(
        tool.run({
          coordinates: [
            { longitude: -73.989, latitude: 40.733 },
            { longitude: -73.979, latitude: 40.743 }
          ],
          routing_profile: 'walking',
          walkway_bias: -1.5
        })
      ).resolves.toMatchObject({
        is_error: true
      });

      // Test with value above maximum (1)
      await expect(
        tool.run({
          coordinates: [
            { longitude: -73.989, latitude: 40.733 },
            { longitude: -73.979, latitude: 40.743 }
          ],
          routing_profile: 'walking',
          walkway_bias: 1.2
        })
      ).resolves.toMatchObject({
        is_error: true
      });

      // Test with valid values
      const mockFetch = setupFetch();
      await tool.run({
        coordinates: [
          { longitude: -73.989, latitude: 40.733 },
          { longitude: -73.979, latitude: 40.743 }
        ],
        routing_profile: 'walking',
        walkway_bias: -0.5
      });
      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('walkway_bias=-0.5');
    });
  });

  describe('exclude parameter and routing profile validations', () => {
    it('accepts driving-specific exclusions with driving profiles', async () => {
      const mockFetch = setupFetch();
      const tool = new DirectionsTool();

      // Test with driving profile
      await expect(
        tool.run({
          coordinates: [
            { longitude: -73.989, latitude: 40.733 },
            { longitude: -73.979, latitude: 40.743 }
          ],
          routing_profile: 'driving',
          exclude: 'toll,motorway,unpaved'
        })
      ).resolves.not.toMatchObject({
        is_error: true
      });

      // Test with driving-traffic profile
      await expect(
        tool.run({
          coordinates: [
            { longitude: -73.989, latitude: 40.733 },
            { longitude: -73.979, latitude: 40.743 }
          ],
          routing_profile: 'driving-traffic',
          exclude: 'tunnel,country_border,state_border'
        })
      ).resolves.not.toMatchObject({
        is_error: true
      });
    });

    it('rejects driving-specific exclusions with non-driving profiles', async () => {
      const tool = new DirectionsTool();

      // Test with walking profile
      await expect(
        tool.run({
          coordinates: [
            { longitude: -73.989, latitude: 40.733 },
            { longitude: -73.979, latitude: 40.743 }
          ],
          routing_profile: 'walking',
          exclude: 'toll'
        })
      ).resolves.toMatchObject({
        is_error: true
      });

      // Test with cycling profile
      await expect(
        tool.run({
          coordinates: [
            { longitude: -73.989, latitude: 40.733 },
            { longitude: -73.979, latitude: 40.743 }
          ],
          routing_profile: 'cycling',
          exclude: 'motorway'
        })
      ).resolves.toMatchObject({
        is_error: true
      });
    });

    it('accepts common exclusions with all routing profiles', async () => {
      const mockFetch = setupFetch();
      const tool = new DirectionsTool();

      // Test with driving profile
      await expect(
        tool.run({
          coordinates: [
            { longitude: -73.989, latitude: 40.733 },
            { longitude: -73.979, latitude: 40.743 }
          ],
          routing_profile: 'driving',
          exclude: 'ferry'
        })
      ).resolves.not.toMatchObject({
        is_error: true
      });

      // Test with walking profile
      await expect(
        tool.run({
          coordinates: [
            { longitude: -73.989, latitude: 40.733 },
            { longitude: -73.979, latitude: 40.743 }
          ],
          routing_profile: 'walking',
          exclude: 'ferry'
        })
      ).resolves.not.toMatchObject({
        is_error: true
      });

      // Test with cycling profile
      await expect(
        tool.run({
          coordinates: [
            { longitude: -73.989, latitude: 40.733 },
            { longitude: -73.979, latitude: 40.743 }
          ],
          routing_profile: 'cycling',
          exclude: 'cash_only_tolls'
        })
      ).resolves.not.toMatchObject({
        is_error: true
      });
    });

    it('accepts point exclusions with driving profiles and rejects with non-driving profiles', async () => {
      const mockFetch = setupFetch();
      const tool = new DirectionsTool();

      // Test with driving profile - should work
      await expect(
        tool.run({
          coordinates: [
            { longitude: -73.989, latitude: 40.733 },
            { longitude: -73.979, latitude: 40.743 }
          ],
          routing_profile: 'driving',
          exclude: 'point(-73.95 40.75)'
        })
      ).resolves.not.toMatchObject({
        is_error: true
      });

      // Test with walking profile - should fail
      await expect(
        tool.run({
          coordinates: [
            { longitude: -73.989, latitude: 40.733 },
            { longitude: -73.979, latitude: 40.743 }
          ],
          routing_profile: 'walking',
          exclude: 'point(-73.95 40.75)'
        })
      ).resolves.toMatchObject({
        is_error: true
      });

      // Test with cycling profile - should fail
      await expect(
        tool.run({
          coordinates: [
            { longitude: -73.989, latitude: 40.733 },
            { longitude: -73.979, latitude: 40.743 }
          ],
          routing_profile: 'cycling',
          exclude: 'point(-73.95 40.75)'
        })
      ).resolves.toMatchObject({
        is_error: true
      });
    });

    it('handles multiple exclusions in a single request correctly', async () => {
      const mockFetch = setupFetch();
      const tool = new DirectionsTool();

      // All valid exclusions for driving profile
      await expect(
        tool.run({
          coordinates: [
            { longitude: -73.989, latitude: 40.733 },
            { longitude: -73.979, latitude: 40.743 }
          ],
          routing_profile: 'driving',
          exclude: 'toll,motorway,ferry,cash_only_tolls,point(-73.95 40.75)'
        })
      ).resolves.not.toMatchObject({
        is_error: true
      });

      // Mixed valid and invalid exclusions (ferry is valid for walking, toll is not)
      await expect(
        tool.run({
          coordinates: [
            { longitude: -73.989, latitude: 40.733 },
            { longitude: -73.979, latitude: 40.743 }
          ],
          routing_profile: 'walking',
          exclude: 'ferry,toll'
        })
      ).resolves.toMatchObject({
        is_error: true
      });

      // All valid exclusions for cycling profile
      await expect(
        tool.run({
          coordinates: [
            { longitude: -73.989, latitude: 40.733 },
            { longitude: -73.979, latitude: 40.743 }
          ],
          routing_profile: 'cycling',
          exclude: 'ferry,cash_only_tolls'
        })
      ).resolves.not.toMatchObject({
        is_error: true
      });
    });
  });

  describe('depart_at parameter validations', () => {
    it('accepts depart_at with driving profiles', async () => {
      const mockFetch = setupFetch();
      const tool = new DirectionsTool();
      const validDateTime = '2025-06-05T10:30:00Z';

      // Test with driving profile
      await expect(
        tool.run({
          coordinates: [
            { longitude: -73.989, latitude: 40.733 },
            { longitude: -73.979, latitude: 40.743 }
          ],
          routing_profile: 'driving',
          depart_at: validDateTime
        })
      ).resolves.not.toMatchObject({
        is_error: true
      });

      const calledUrlDriving = mockFetch.mock.calls[0][0];
      expect(calledUrlDriving).toContain(
        `depart_at=${encodeURIComponent(validDateTime)}`
      );

      // Test with driving-traffic profile
      await expect(
        tool.run({
          coordinates: [
            { longitude: -73.989, latitude: 40.733 },
            { longitude: -73.979, latitude: 40.743 }
          ],
          routing_profile: 'driving-traffic',
          depart_at: validDateTime
        })
      ).resolves.not.toMatchObject({
        is_error: true
      });

      const calledUrlTraffic = mockFetch.mock.calls[1][0];
      expect(calledUrlTraffic).toContain(
        `depart_at=${encodeURIComponent(validDateTime)}`
      );
    });

    describe('vehicle dimension parameters validations', () => {
      it('accepts vehicle dimensions with driving profiles', async () => {
        const mockFetch = setupFetch();
        const tool = new DirectionsTool();

        // Test with driving profile
        await expect(
          tool.run({
            coordinates: [
              { longitude: -73.989, latitude: 40.733 },
              { longitude: -73.979, latitude: 40.743 }
            ],
            routing_profile: 'driving',
            max_height: 4.5,
            max_width: 2.5,
            max_weight: 7.8
          })
        ).resolves.not.toMatchObject({
          is_error: true
        });

        const calledUrlDriving = mockFetch.mock.calls[0][0];
        expect(calledUrlDriving).toContain('max_height=4.5');
        expect(calledUrlDriving).toContain('max_width=2.5');
        expect(calledUrlDriving).toContain('max_weight=7.8');

        // Test with driving-traffic profile
        await expect(
          tool.run({
            coordinates: [
              { longitude: -73.989, latitude: 40.733 },
              { longitude: -73.979, latitude: 40.743 }
            ],
            routing_profile: 'driving-traffic',
            max_height: 3.2
          })
        ).resolves.not.toMatchObject({
          is_error: true
        });

        const calledUrlTraffic = mockFetch.mock.calls[1][0];
        expect(calledUrlTraffic).toContain('max_height=3.2');
      });

      it('rejects vehicle dimensions with non-driving profiles', async () => {
        const tool = new DirectionsTool();

        // Test with walking profile
        await expect(
          tool.run({
            coordinates: [
              { longitude: -73.989, latitude: 40.733 },
              { longitude: -73.979, latitude: 40.743 }
            ],
            routing_profile: 'walking',
            max_height: 4.5
          })
        ).resolves.toMatchObject({
          is_error: true
        });

        // Test with cycling profile
        await expect(
          tool.run({
            coordinates: [
              { longitude: -73.989, latitude: 40.733 },
              { longitude: -73.979, latitude: 40.743 }
            ],
            routing_profile: 'cycling',
            max_width: 2.0
          })
        ).resolves.toMatchObject({
          is_error: true
        });
      });

      it('validates dimension value ranges', async () => {
        const tool = new DirectionsTool();

        // Test invalid height (too high)
        await expect(
          tool.run({
            coordinates: [
              { longitude: -73.989, latitude: 40.733 },
              { longitude: -73.979, latitude: 40.743 }
            ],
            routing_profile: 'driving',
            max_height: 15.0
          })
        ).resolves.toMatchObject({
          is_error: true
        });

        // Test invalid width (negative)
        await expect(
          tool.run({
            coordinates: [
              { longitude: -73.989, latitude: 40.733 },
              { longitude: -73.979, latitude: 40.743 }
            ],
            routing_profile: 'driving',
            max_width: -1.0
          })
        ).resolves.toMatchObject({
          is_error: true
        });

        // Test invalid weight (too heavy)
        await expect(
          tool.run({
            coordinates: [
              { longitude: -73.989, latitude: 40.733 },
              { longitude: -73.979, latitude: 40.743 }
            ],
            routing_profile: 'driving',
            max_weight: 150.0
          })
        ).resolves.toMatchObject({
          is_error: true
        });
      });
    });

    it('rejects depart_at with non-driving profiles', async () => {
      const tool = new DirectionsTool();
      const validDateTime = '2025-06-05T10:30:00Z';

      // Test with walking profile
      await expect(
        tool.run({
          coordinates: [
            { longitude: -73.989, latitude: 40.733 },
            { longitude: -73.979, latitude: 40.743 }
          ],
          routing_profile: 'walking',
          depart_at: validDateTime
        })
      ).resolves.toMatchObject({
        is_error: true
      });

      // Test with cycling profile
      await expect(
        tool.run({
          coordinates: [
            { longitude: -73.989, latitude: 40.733 },
            { longitude: -73.979, latitude: 40.743 }
          ],
          routing_profile: 'cycling',
          depart_at: validDateTime
        })
      ).resolves.toMatchObject({
        is_error: true
      });
    });

    it('accepts valid date-time formats', async () => {
      const mockFetch = setupFetch();
      const tool = new DirectionsTool();
      const baseCoordinates = [
        { longitude: -73.989, latitude: 40.733 },
        { longitude: -73.979, latitude: 40.743 }
      ];

      // Format 1: YYYY-MM-DDThh:mm:ssZ
      await expect(
        tool.run({
          coordinates: baseCoordinates,
          depart_at: '2025-06-05T10:30:00Z'
        })
      ).resolves.not.toMatchObject({
        is_error: true
      });

      // Format 2: YYYY-MM-DDThh:mmss±hh:mm
      await expect(
        tool.run({
          coordinates: baseCoordinates,
          depart_at: '2025-06-05T10:30:00+02:00'
        })
      ).resolves.not.toMatchObject({
        is_error: true
      });

      // Format 3: YYYY-MM-DDThh:mm
      await expect(
        tool.run({
          coordinates: baseCoordinates,
          depart_at: '2025-06-05T10:30'
        })
      ).resolves.not.toMatchObject({
        is_error: true
      });
    });

    it('rejects invalid date-time formats', async () => {
      const tool = new DirectionsTool();
      const baseCoordinates = [
        { longitude: -73.989, latitude: 40.733 },
        { longitude: -73.979, latitude: 40.743 }
      ];

      // Invalid format examples
      const invalidFormats = [
        '2025/06/05 10:30:00', // Wrong delimiter
        '2025-06-05 10:30:00', // Missing T
        '2025-06-05T10:30:00+0200', // Missing colon in timezone
        '25-6-5T10:30:00Z', // Incorrect date format
        '2025-06-05T10:30:00ZZ', // Double timezone
        '2025-06-05', // Missing time
        '10:30:00' // Missing date
      ];

      // Test each format separately
      for (let i = 0; i < invalidFormats.length; i++) {
        const format = invalidFormats[i];

        // Test each invalid format individually for better error reporting
        const result = await tool.run({
          coordinates: baseCoordinates,
          depart_at: format
        });

        expect(result.is_error).toBe(true);
      }
    });

    it('rejects dates with invalid components', async () => {
      const tool = new DirectionsTool();
      const baseCoordinates = [
        { longitude: -73.989, latitude: 40.733 },
        { longitude: -73.979, latitude: 40.743 }
      ];

      // Invalid time components
      const invalidDates = [
        '2025-13-05T10:30:00Z', // Invalid month (13)
        '2025-06-32T10:30:00Z', // Invalid day (32)
        '2025-06-05T24:30:00Z', // Invalid hour (24)
        '2025-06-05T10:60:00Z', // Invalid minute (60)
        '2025-06-05T10:30:60Z' // Invalid second (60)
      ];

      for (const date of invalidDates) {
        await expect(
          tool.run({
            coordinates: baseCoordinates,
            depart_at: date
          })
        ).resolves.toMatchObject({
          is_error: true
        });
      }
    });
  });

  describe('arrive_by parameter validations', () => {
    it('accepts arrive_by with driving profile only', async () => {
      const validDateTime = '2025-06-05T10:30:00Z';
      const mockFetch = setupFetch();

      // Test with driving profile - should work
      await new DirectionsTool().run({
        coordinates: [
          { longitude: -74.1, latitude: 40.7 },
          { longitude: -74.2, latitude: 40.8 }
        ],
        routing_profile: 'driving',
        arrive_by: validDateTime
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain(
        `arrive_by=${encodeURIComponent(validDateTime)}`
      );
    });

    it('rejects arrive_by with non-driving profiles', async () => {
      const validDateTime = '2025-06-05T10:30:00Z';

      // Test with driving-traffic profile
      const result1 = await new DirectionsTool().run({
        coordinates: [
          { longitude: -74.1, latitude: 40.7 },
          { longitude: -74.2, latitude: 40.8 }
        ],
        routing_profile: 'driving-traffic',
        arrive_by: validDateTime
      });

      expect(result1.is_error).toBe(true);

      // Test with walking profile
      const result2 = await new DirectionsTool().run({
        coordinates: [
          { longitude: -74.1, latitude: 40.7 },
          { longitude: -74.2, latitude: 40.8 }
        ],
        routing_profile: 'walking',
        arrive_by: validDateTime
      });

      expect(result2.is_error).toBe(true);

      // Test with cycling profile
      const result3 = await new DirectionsTool().run({
        coordinates: [
          { longitude: -74.1, latitude: 40.7 },
          { longitude: -74.2, latitude: 40.8 }
        ],
        routing_profile: 'cycling',
        arrive_by: validDateTime
      });

      expect(result3.is_error).toBe(true);
    });

    it('rejects when both arrive_by and depart_at are provided', async () => {
      const result = await new DirectionsTool().run({
        coordinates: [
          { longitude: -74.1, latitude: 40.7 },
          { longitude: -74.2, latitude: 40.8 }
        ],
        routing_profile: 'driving',
        depart_at: '2025-06-05T09:30:00Z',
        arrive_by: '2025-06-05T10:30:00Z'
      });

      expect(result.is_error).toBe(true);
    });

    it('accepts valid ISO 8601 formats for arrive_by', async () => {
      const mockFetch = setupFetch();

      // Test with Z format
      await new DirectionsTool().run({
        coordinates: [
          { longitude: -74.1, latitude: 40.7 },
          { longitude: -74.2, latitude: 40.8 }
        ],
        routing_profile: 'driving',
        arrive_by: '2025-06-05T10:30:00Z'
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      mockFetch.mockClear();

      // Test with timezone offset format
      await new DirectionsTool().run({
        coordinates: [
          { longitude: -74.1, latitude: 40.7 },
          { longitude: -74.2, latitude: 40.8 }
        ],
        routing_profile: 'driving',
        arrive_by: '2025-06-05T10:30:00+02:00'
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      mockFetch.mockClear();

      // Test with simple time format (no seconds, no timezone)
      await new DirectionsTool().run({
        coordinates: [
          { longitude: -74.1, latitude: 40.7 },
          { longitude: -74.2, latitude: 40.8 }
        ],
        routing_profile: 'driving',
        arrive_by: '2025-06-05T10:30'
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('rejects invalid formats for arrive_by', async () => {
      const invalidFormats = [
        // Invalid date formats
        '2025/06/05T10:30:00Z',
        '5-6-2025T10:30:00Z',
        '2025-6-5T10:30:00Z',

        // Invalid time formats
        '2025-06-05T1:30:00Z',
        '2025-06-05T10-30-00Z',

        // Missing T separator
        '2025-06-05 10:30:00Z',

        // Completely wrong formats
        '10:30 June 5, 2025',
        'June 5, 2025 10:30 AM',
        'Tomorrow at 10:30'
      ];

      for (const format of invalidFormats) {
        const result = await new DirectionsTool().run({
          coordinates: [
            { longitude: -74.1, latitude: 40.7 },
            { longitude: -74.2, latitude: 40.8 }
          ],
          routing_profile: 'driving',
          arrive_by: format
        });

        expect(result.is_error).toBe(true);
      }
    });

    it('validates date and time component ranges for arrive_by', async () => {
      const invalidDates = [
        '2025-13-05T10:30:00Z', // Invalid month (13)
        '2025-06-32T10:30:00Z', // Invalid day (32)
        '2025-02-30T10:30:00Z', // Invalid day in February
        '2025-06-05T24:30:00Z', // Invalid hour (24)
        '2025-06-05T10:60:00Z', // Invalid minute (60)
        '2025-06-05T10:30:60Z' // Invalid second (60)
      ];

      for (const date of invalidDates) {
        const result = await new DirectionsTool().run({
          coordinates: [
            { longitude: -74.1, latitude: 40.7 },
            { longitude: -74.2, latitude: 40.8 }
          ],
          routing_profile: 'driving',
          arrive_by: date
        });

        expect(result.is_error).toBe(true);
      }
    });
  });
});
