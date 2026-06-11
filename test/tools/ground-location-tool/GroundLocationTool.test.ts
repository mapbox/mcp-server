// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, afterEach, vi } from 'vitest';
import { setupHttpRequest } from '../../utils/httpPipelineUtils.js';
import { GroundLocationTool } from '../../../src/tools/ground-location-tool/GroundLocationTool.js';
import { InMemoryTaskStore } from '@modelcontextprotocol/sdk/experimental/tasks';

const geocodeResponse = {
  features: [
    {
      properties: {
        name: 'Mission District',
        full_address: 'Mission District, San Francisco, CA'
      },
      geometry: { type: 'Point', coordinates: [-122.419, 37.759] }
    }
  ]
};

const categoryResponse = {
  features: [
    {
      properties: {
        name: 'Four Barrel Coffee',
        full_address: '375 Valencia St, San Francisco, CA',
        poi_category: ['coffee'],
        distance: 120
      },
      geometry: { type: 'Point', coordinates: [-122.421, 37.762] }
    }
  ]
};

const isochroneResponse = {
  features: [
    {
      properties: { contour: 5 },
      geometry: { type: 'Polygon', coordinates: [] }
    },
    {
      properties: { contour: 10 },
      geometry: { type: 'Polygon', coordinates: [] }
    },
    {
      properties: { contour: 15 },
      geometry: { type: 'Polygon', coordinates: [] }
    }
  ]
};

function setupMockHttp(responses: Record<string, object>) {
  const mockFetch = vi.fn().mockImplementation((url: string) => {
    for (const [key, body] of Object.entries(responses)) {
      if (url.includes(key)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => body
        });
      }
    }
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
  });

  const { httpRequest } = setupHttpRequest();
  // Override with our multi-response mock
  const tool = new GroundLocationTool({
    httpRequest: mockFetch as unknown as typeof httpRequest
  });

  return { tool, mockFetch };
}

describe('GroundLocationTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns neighborhood context without sampling', async () => {
    const { tool, mockFetch } = setupMockHttp({
      'geocode/v6/reverse': geocodeResponse,
      'isochrone/v1': isochroneResponse
    });

    const result = await tool.run({ longitude: -122.419, latitude: 37.759 });

    expect(result.isError).toBe(false);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('Mission District');
    expect(text).toContain('neighborhood context');
    // geocode + isochrone called, no category search (no query)
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('performs category search when query is provided', async () => {
    const { tool, mockFetch } = setupMockHttp({
      'geocode/v6/reverse': geocodeResponse,
      'category/coffee': categoryResponse,
      'isochrone/v1': isochroneResponse
    });

    const result = await tool.run({
      longitude: -122.419,
      latitude: 37.759,
      query: 'coffee'
    });

    expect(result.isError).toBe(false);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('Four Barrel Coffee');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('category/coffee')
    );
  });

  it('skips isochrone for routing strategy via sampling', async () => {
    const { tool, mockFetch } = setupMockHttp({
      'geocode/v6/reverse': geocodeResponse
    });

    // Simulate a server with sampling support that returns 'routing'
    const mockServer = {
      server: {
        getClientCapabilities: () => ({ sampling: {} }),
        createMessage: vi.fn().mockResolvedValue({
          role: 'assistant',
          content: { type: 'text', text: 'routing' },
          model: 'test',
          stopReason: 'endTurn'
        }),
        sendLoggingMessage: vi.fn()
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tool as any).server = mockServer;

    const result = await tool.run({
      longitude: -122.419,
      latitude: 37.759,
      query: 'coffee shop'
    });

    expect(result.isError).toBe(false);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('routing coordinates');
    // geocode + category search; no isochrone for routing
    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('isochrone'),
      expect.anything()
    );
    expect(mockServer.server.createMessage).toHaveBeenCalledOnce();
  });

  it('uses address/poi geocode types for routing strategy', async () => {
    const { tool, mockFetch } = setupMockHttp({
      'geocode/v6/reverse': geocodeResponse
    });

    const mockServer = {
      server: {
        getClientCapabilities: () => ({ sampling: {} }),
        createMessage: vi.fn().mockResolvedValue({
          role: 'assistant',
          content: { type: 'text', text: 'routing' },
          model: 'test',
          stopReason: 'endTurn'
        }),
        sendLoggingMessage: vi.fn()
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tool as any).server = mockServer;

    await tool.run({ longitude: -122.419, latitude: 37.759 });

    const geocodeCall = mockFetch.mock.calls.find((c: string[]) =>
      c[0].includes('geocode/v6/reverse')
    );
    expect(geocodeCall?.[0]).toContain('types=address%2Cpoi');
  });

  it('falls back to neighborhood when sampling returns unknown value', async () => {
    const { tool } = setupMockHttp({
      'geocode/v6/reverse': geocodeResponse,
      'isochrone/v1': isochroneResponse
    });

    const mockServer = {
      server: {
        getClientCapabilities: () => ({ sampling: {} }),
        createMessage: vi.fn().mockResolvedValue({
          role: 'assistant',
          content: { type: 'text', text: 'something unexpected' },
          model: 'test',
          stopReason: 'endTurn'
        }),
        sendLoggingMessage: vi.fn()
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tool as any).server = mockServer;

    const result = await tool.run({ longitude: -122.419, latitude: 37.759 });

    expect(result.isError).toBe(false);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('neighborhood context');
  });

  it('falls back gracefully when sampling throws', async () => {
    const { tool } = setupMockHttp({
      'geocode/v6/reverse': geocodeResponse,
      'isochrone/v1': isochroneResponse
    });

    const mockServer = {
      server: {
        getClientCapabilities: () => ({ sampling: {} }),
        createMessage: vi.fn().mockRejectedValue(new Error('sampling failed')),
        sendLoggingMessage: vi.fn()
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tool as any).server = mockServer;

    const result = await tool.run({ longitude: -122.419, latitude: 37.759 });

    expect(result.isError).toBe(false);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('neighborhood context');
  });

  it('boosts poi limit when strategy is poi', async () => {
    const { tool, mockFetch } = setupMockHttp({
      'geocode/v6/reverse': geocodeResponse,
      'category/restaurant': categoryResponse,
      'isochrone/v1': isochroneResponse
    });

    const mockServer = {
      server: {
        getClientCapabilities: () => ({ sampling: {} }),
        createMessage: vi.fn().mockResolvedValue({
          role: 'assistant',
          content: { type: 'text', text: 'poi' },
          model: 'test',
          stopReason: 'endTurn'
        }),
        sendLoggingMessage: vi.fn()
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tool as any).server = mockServer;

    await tool.run({
      longitude: -122.419,
      latitude: 37.759,
      query: 'restaurant',
      limit: 5 // below the poi minimum of 15
    });

    const categoryCall = mockFetch.mock.calls.find((c: string[]) =>
      c[0].includes('category/restaurant')
    );
    expect(categoryCall?.[0]).toContain('limit=15');
  });
});

describe('GroundLocationTool — task-based flow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function buildTaskStore() {
    const store = new InMemoryTaskStore();
    const requestId = 1;
    const request = {
      method: 'tools/call',
      params: { name: 'ground_location_tool', arguments: {} }
    };
    // Wrap in a RequestTaskStore-compatible shim bound to a fixed session.
    const taskStore = {
      createTask: (params: { ttl?: number }) =>
        store.createTask(params, requestId, request),
      getTask: (taskId: string) =>
        store.getTask(taskId).then((t) => {
          if (!t) throw new Error(`task not found: ${taskId}`);
          return t;
        }),
      storeTaskResult: (
        taskId: string,
        status: 'completed' | 'failed',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result: any
      ) => store.storeTaskResult(taskId, status, result),
      getTaskResult: (taskId: string) => store.getTaskResult(taskId),
      updateTaskStatus: (
        taskId: string,
        status: Parameters<typeof store.updateTaskStatus>[1]
      ) => store.updateTaskStatus(taskId, status),
      listTasks: (cursor?: string) => store.listTasks(cursor)
    };
    return taskStore;
  }

  it('creates task immediately and resolves with place name', async () => {
    const { httpRequest } = setupHttpRequest();
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('geocode/v6/reverse'))
        return Promise.resolve({
          ok: true,
          json: async () => geocodeResponse
        });
      if (url.includes('isochrone/v1'))
        return Promise.resolve({
          ok: true,
          json: async () => isochroneResponse
        });
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
    const tool = new GroundLocationTool({
      httpRequest: mockFetch as unknown as typeof httpRequest
    });

    const taskStore = buildTaskStore();
    const task = await taskStore.createTask({ ttl: 60_000 });

    // Simulate what createTask handler does
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (tool as any).runTaskBackground(
      { longitude: -122.419, latitude: 37.759 },
      process.env.MAPBOX_ACCESS_TOKEN,
      task.taskId,
      taskStore
    );

    const completedTask = await taskStore.getTask(task.taskId);
    expect(completedTask.status).toBe('completed');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (await taskStore.getTaskResult(task.taskId)) as any;
    expect(result.isError).toBe(false);
    const text = result.content[0].text as string;
    expect(text).toContain('Mission District');
  });

  it('stores failed result when API errors out', async () => {
    const { httpRequest } = setupHttpRequest();
    const mockFetch = vi.fn().mockRejectedValue(new Error('network error'));
    const tool = new GroundLocationTool({
      httpRequest: mockFetch as unknown as typeof httpRequest
    });

    const taskStore = buildTaskStore();
    const task = await taskStore.createTask({ ttl: 60_000 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (tool as any).runTaskBackground(
      { longitude: -122.419, latitude: 37.759 },
      process.env.MAPBOX_ACCESS_TOKEN,
      task.taskId,
      taskStore
    );

    const completedTask = await taskStore.getTask(task.taskId);
    expect(completedTask.status).toBe('failed');
  });

  it('non-task clients still get a result via runTaskBackground', async () => {
    const { httpRequest } = setupHttpRequest();
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('geocode/v6/reverse'))
        return Promise.resolve({
          ok: true,
          json: async () => geocodeResponse
        });
      if (url.includes('isochrone/v1'))
        return Promise.resolve({
          ok: true,
          json: async () => isochroneResponse
        });
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
    const tool = new GroundLocationTool({
      httpRequest: mockFetch as unknown as typeof httpRequest
    });

    const taskStore = buildTaskStore();
    const task = await taskStore.createTask({ ttl: 60_000, pollInterval: 50 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (tool as any).runTaskBackground(
      { longitude: -122.419, latitude: 37.759 },
      process.env.MAPBOX_ACCESS_TOKEN,
      task.taskId,
      taskStore
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (await taskStore.getTaskResult(task.taskId)) as any;
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('Mission District');
  });
});
