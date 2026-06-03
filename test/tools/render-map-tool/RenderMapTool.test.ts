// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, afterEach, vi } from 'vitest';
import { RenderMapTool } from '../../../src/tools/render-map-tool/RenderMapTool.js';

describe('RenderMapTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('declares meta.ui.resourceUri targeting the shared map-app resource', () => {
    const tool = new RenderMapTool({ httpRequest: vi.fn() });
    expect(tool.meta?.ui?.resourceUri).toBe('ui://mapbox/map-app/index.html');
  });

  it('echoes layer + marker counts in the result', async () => {
    const tool = new RenderMapTool({ httpRequest: vi.fn() });
    const result = await tool.run({
      summary: 'Test trip',
      layers: [
        {
          id: 'route',
          type: 'line',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [-77, 38],
                [-76, 39]
              ]
            },
            properties: {}
          },
          paint: { 'line-color': '#3b82f6', 'line-width': 5 }
        }
      ],
      markers: [
        { coordinates: [-77, 38], style: 'start' },
        { coordinates: [-76, 39], style: 'end' }
      ]
    });

    expect(result.isError).toBe(false);
    const sc = result.structuredContent as {
      rendered: boolean;
      layer_count: number;
      marker_count: number;
      _mapApp?: { layers: unknown[]; markers: unknown[] };
    };
    expect(sc.rendered).toBe(true);
    expect(sc.layer_count).toBe(1);
    expect(sc.marker_count).toBe(2);
    expect(sc._mapApp?.layers).toHaveLength(1);
    expect(sc._mapApp?.markers).toHaveLength(2);
  });

  it('rejects coordinates that are not [lng, lat] pairs', async () => {
    const tool = new RenderMapTool({ httpRequest: vi.fn() });
    const result = await tool.run({
      markers: [{ coordinates: [-77], style: 'pin' }]
    });
    expect(result.isError).toBe(true);
  });

  it('accepts a payload with only markers (no layers)', async () => {
    const tool = new RenderMapTool({ httpRequest: vi.fn() });
    const result = await tool.run({
      summary: 'Search results',
      markers: [
        { coordinates: [-77, 38], style: 'pin', popup: 'Result 1' },
        { coordinates: [-76, 39], style: 'pin', popup: 'Result 2' }
      ]
    });
    expect(result.isError).toBe(false);
    const sc = result.structuredContent as { layer_count: number };
    expect(sc.layer_count).toBe(0);
  });

  it('resolves a payload_ref into a renderable payload', async () => {
    const { storeMapPayload } =
      await import('../../../src/utils/storeMapPayload.js');
    const ref = storeMapPayload({
      summary: 'Cached route',
      layers: [
        {
          id: 'route',
          type: 'line',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [-77, 38],
                [-76, 39]
              ]
            },
            properties: {}
          }
        }
      ]
    });

    const tool = new RenderMapTool({ httpRequest: vi.fn() });
    const result = await tool.run({ payload_refs: [ref] });
    expect(result.isError).toBe(false);
    const sc = result.structuredContent as {
      layer_count: number;
      summary?: string;
    };
    expect(sc.layer_count).toBe(1);
    expect(sc.summary).toBe('Cached route');
  });

  it('merges multiple payload_refs into a single map', async () => {
    const { storeMapPayload } =
      await import('../../../src/utils/storeMapPayload.js');
    const a = storeMapPayload({
      summary: 'Iso A',
      layers: [
        {
          id: 'a',
          type: 'fill',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [-77, 38],
                  [-76, 38],
                  [-76, 39],
                  [-77, 39],
                  [-77, 38]
                ]
              ]
            },
            properties: {}
          }
        }
      ]
    });
    const b = storeMapPayload({
      summary: 'Iso B',
      layers: [
        {
          id: 'a', // colliding id → should be renamed during merge
          type: 'fill',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [-78, 38],
                  [-77, 38],
                  [-77, 39],
                  [-78, 39],
                  [-78, 38]
                ]
              ]
            },
            properties: {}
          }
        }
      ]
    });

    const tool = new RenderMapTool({ httpRequest: vi.fn() });
    const result = await tool.run({ payload_refs: [a, b] });
    expect(result.isError).toBe(false);
    const sc = result.structuredContent as {
      layer_count: number;
      summary?: string;
    };
    expect(sc.layer_count).toBe(2);
    expect(sc.summary).toBe('Iso A · Iso B');
  });
});
