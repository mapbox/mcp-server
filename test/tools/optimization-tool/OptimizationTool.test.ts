// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, afterEach, vi } from 'vitest';
import { setupHttpRequest } from '../../utils/httpPipelineUtils.js';
import {
  HttpPipeline,
  UserAgentPolicy
} from '../../../src/utils/httpPipeline.js';
import { OptimizationTool } from '../../../src/tools/optimization-tool/OptimizationTool.js';

const sampleOptimizationJobResponse = {
  id: 'test-job-123',
  status: 'processing'
};

const sampleOptimizationResultResponse = {
  routes: [
    {
      vehicle: 'vehicle-1',
      stops: [
        {
          type: 'start',
          location: 'location-0',
          eta: '2024-01-01T10:00:00Z',
          odometer: 0,
          wait: 0,
          duration: 0
        },
        {
          type: 'service',
          location: 'location-1',
          eta: '2024-01-01T10:05:00Z',
          odometer: 1500,
          wait: 0,
          duration: 300,
          services: ['service-1']
        },
        {
          type: 'service',
          location: 'location-2',
          eta: '2024-01-01T10:12:00Z',
          odometer: 3200,
          wait: 0,
          duration: 300,
          services: ['service-2']
        },
        {
          type: 'end',
          location: 'location-0',
          eta: '2024-01-01T10:20:00Z',
          odometer: 5000,
          wait: 0,
          duration: 0
        }
      ]
    }
  ],
  dropped: {
    services: [],
    shipments: []
  }
};

// Helper function to create mock httpRequest with polling behavior
function createMockWithPolling(
  postResponse: unknown,
  getResponse: unknown | ((callNum: number) => unknown)
) {
  const mockHttpRequest = vi.fn();
  let callCount = 0;

  mockHttpRequest.mockImplementation(() => {
    callCount++;
    // First call: POST to create job
    if (callCount === 1) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => postResponse
      });
    }
    // Subsequent calls: GET polling
    const response =
      typeof getResponse === 'function' ? getResponse(callCount) : getResponse;
    return Promise.resolve(response);
  });

  const pipeline = new HttpPipeline(mockHttpRequest);
  const userAgent = 'TestServer/1.0.0 (default, no-tag, abcdef)';
  pipeline.usePolicy(new UserAgentPolicy(userAgent));

  return {
    httpRequest: pipeline.execute.bind(pipeline),
    mockHttpRequest
  };
}

describe('OptimizationTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends custom header', async () => {
    const { httpRequest, mockHttpRequest } = createMockWithPolling(
      sampleOptimizationJobResponse,
      {
        ok: true,
        status: 200,
        json: async () => sampleOptimizationResultResponse
      }
    );

    await new OptimizationTool({ httpRequest }).run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 },
        { longitude: -122.4197, latitude: 37.7751 }
      ]
    });

    // OptimizationTool makes 2 calls (POST + GET polling), verify headers on both
    expect(mockHttpRequest).toHaveBeenCalledTimes(2);
    const firstCallArgs = mockHttpRequest.mock.calls[0];
    expect(firstCallArgs[1]?.headers).toMatchObject({
      'User-Agent': expect.any(String)
    });
  });

  it('works in simplified mode with default vehicle', async () => {
    const { httpRequest, mockHttpRequest } = createMockWithPolling(
      sampleOptimizationJobResponse,
      {
        ok: true,
        status: 200,
        json: async () => sampleOptimizationResultResponse
      }
    );

    const tool = new OptimizationTool({ httpRequest });
    const result = await tool.run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 },
        { longitude: -122.4197, latitude: 37.7751 }
      ],
      profile: 'mapbox/driving'
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toBeDefined();

    // Verify POST request body includes auto-generated locations and vehicle
    const firstCall = mockHttpRequest.mock.calls[0];
    const postBody = JSON.parse((firstCall[1] as { body: string }).body);

    expect(postBody.locations).toHaveLength(3);
    expect(postBody.locations[0].name).toBe('location-0');
    expect(postBody.vehicles).toHaveLength(1);
    expect(postBody.vehicles[0].name).toBe('vehicle-1');
    expect(postBody.vehicles[0].start_location).toBe('location-0');
    expect(postBody.vehicles[0].end_location).toBe('location-0');

    // In simplified mode, services are created for all locations except first
    expect(postBody.services).toHaveLength(2);
    expect(postBody.services[0].name).toBe('service-1');
    expect(postBody.services[0].location).toBe('location-1');
  });

  it('works in advanced mode with custom vehicles and services', async () => {
    const { httpRequest, mockHttpRequest } = createMockWithPolling(
      sampleOptimizationJobResponse,
      {
        ok: true,
        status: 200,
        json: async () => sampleOptimizationResultResponse
      }
    );

    const tool = new OptimizationTool({ httpRequest });
    const result = await tool.run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 }
      ],
      vehicles: [
        {
          name: 'custom-vehicle',
          routing_profile: 'mapbox/driving',
          start_location: 'location-0',
          end_location: 'location-0'
        }
      ],
      services: [
        {
          name: 'custom-service',
          location: 'location-1',
          duration: 300
        }
      ]
    });

    expect(result.isError).toBe(false);

    const firstCall = mockHttpRequest.mock.calls[0];
    const postBody = JSON.parse((firstCall[1] as { body: string }).body);

    expect(postBody.vehicles[0].name).toBe('custom-vehicle');
    expect(postBody.services[0].name).toBe('custom-service');
  });

  it('works with shipments instead of services', async () => {
    const shipmentResponse = {
      ...sampleOptimizationResultResponse,
      routes: [
        {
          vehicle: 'vehicle-1',
          stops: [
            {
              type: 'start',
              location: 'location-0',
              eta: '2024-01-01T10:00:00Z',
              odometer: 0,
              wait: 0,
              duration: 0
            },
            {
              type: 'pickup',
              location: 'location-1',
              eta: '2024-01-01T10:05:00Z',
              odometer: 1500,
              wait: 0,
              duration: 300,
              pickups: ['shipment-1']
            },
            {
              type: 'dropoff',
              location: 'location-2',
              eta: '2024-01-01T10:12:00Z',
              odometer: 3200,
              wait: 0,
              duration: 300,
              dropoffs: ['shipment-1']
            },
            {
              type: 'end',
              location: 'location-0',
              eta: '2024-01-01T10:20:00Z',
              odometer: 5000,
              wait: 0,
              duration: 0
            }
          ]
        }
      ]
    };

    const { httpRequest, mockHttpRequest } = createMockWithPolling(
      sampleOptimizationJobResponse,
      {
        ok: true,
        status: 200,
        json: async () => shipmentResponse
      }
    );

    const tool = new OptimizationTool({ httpRequest });
    const result = await tool.run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 },
        { longitude: -122.4197, latitude: 37.7751 }
      ],
      vehicles: [
        {
          name: 'delivery-vehicle',
          routing_profile: 'mapbox/driving',
          start_location: 'location-0',
          end_location: 'location-0'
        }
      ],
      shipments: [
        {
          name: 'shipment-1',
          from: 'location-1',
          to: 'location-2',
          pickup_duration: 300,
          dropoff_duration: 300
        }
      ]
    });

    expect(result.isError).toBe(false);

    const firstCall = mockHttpRequest.mock.calls[0];
    const postBody = JSON.parse((firstCall[1] as { body: string }).body);

    expect(postBody.shipments).toHaveLength(1);
    expect(postBody.shipments[0].name).toBe('shipment-1');
    expect(postBody.shipments[0].from).toBe('location-1');
    expect(postBody.shipments[0].to).toBe('location-2');
  });

  it('returns error when vehicles provided without services or shipments', async () => {
    const { httpRequest } = setupHttpRequest();

    const tool = new OptimizationTool({ httpRequest });
    const result = await tool.run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 }
      ],
      vehicles: [
        {
          name: 'vehicle-1',
          routing_profile: 'mapbox/driving',
          start_location: 'location-0',
          end_location: 'location-0'
        }
      ]
      // Missing services or shipments
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining(
        'at least one service or shipment is required'
      )
    });
  });

  it('handles polling timeout', async () => {
    const { httpRequest } = createMockWithPolling(
      sampleOptimizationJobResponse,
      {
        ok: true,
        status: 202,
        json: async () => ({ status: 'processing' })
      }
    );

    const tool = new OptimizationTool({ httpRequest });
    const result = await tool.run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 }
      ],
      max_polling_attempts: 2,
      polling_interval_ms: 10
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('timed out after 2 attempts')
    });
  });

  it('handles API error on POST', async () => {
    const { httpRequest } = setupHttpRequest({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () =>
        JSON.stringify({ message: 'Invalid coordinates provided' })
    });

    const tool = new OptimizationTool({ httpRequest });
    const result = await tool.run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 }
      ]
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('Invalid coordinates provided')
    });
  });

  it('handles 404 on polling GET', async () => {
    const { httpRequest } = createMockWithPolling(
      sampleOptimizationJobResponse,
      {
        ok: false,
        status: 404,
        statusText: 'Not Found'
      }
    );

    const tool = new OptimizationTool({ httpRequest });
    const result = await tool.run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 }
      ]
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('not found')
    });
  });

  it('uses correct routing profile', async () => {
    let callCount = 0;
    const { httpRequest, mockHttpRequest } = setupHttpRequest(() => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => sampleOptimizationJobResponse
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => sampleOptimizationResultResponse
      };
    });

    const tool = new OptimizationTool({ httpRequest });
    await tool.run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 }
      ],
      profile: 'mapbox/cycling'
    });

    const firstCall = mockHttpRequest.mock.calls[0];
    const postBody = JSON.parse((firstCall[1] as { body: string }).body);

    expect(postBody.vehicles[0].routing_profile).toBe('mapbox/cycling');
  });

  it('includes structured content in successful response', async () => {
    const { httpRequest } = createMockWithPolling(
      sampleOptimizationJobResponse,
      {
        ok: true,
        status: 200,
        json: async () => sampleOptimizationResultResponse
      }
    );

    const tool = new OptimizationTool({ httpRequest });
    const result = await tool.run({
      coordinates: [
        { longitude: -122.4194, latitude: 37.7749 },
        { longitude: -122.4195, latitude: 37.775 }
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toBeDefined();
    expect(result.structuredContent).toMatchObject({
      routes: expect.arrayContaining([
        expect.objectContaining({
          vehicle: expect.any(String),
          stops: expect.any(Array)
        })
      ]),
      dropped: expect.objectContaining({
        services: expect.any(Array),
        shipments: expect.any(Array)
      })
    });
  });
});
