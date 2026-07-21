// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, afterEach, vi } from 'vitest';
import { RenderMapTool } from '../../../src/tools/render-map-tool/RenderMapTool.js';
import { tokenFor } from '../../utils/tokenTestUtils.js';

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
    const token = tokenFor('account-test-render-map');
    const result = await tool.run(
      {
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
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { authInfo: { token } } as any
    );

    expect(result.isError).toBe(false);
    const sc = result.structuredContent as {
      rendered: boolean;
      layer_count: number;
      marker_count: number;
      mapboxRender?: { ref?: string };
    };
    expect(sc.rendered).toBe(true);
    expect(sc.layer_count).toBe(1);
    expect(sc.marker_count).toBe(2);
    // The merged payload is stashed server-side under a ref for hosts that
    // support resources/read (and to keep the response tiny for very large
    // payloads).
    expect(sc.mapboxRender?.ref).toMatch(/^mapbox:\/\/temp\/map-payload-/);
    const { resolveMapPayloadRef } =
      await import('../../../src/utils/storeMapPayload.js');
    const stored = resolveMapPayloadRef(
      sc.mapboxRender!.ref!,
      'account-test-render-map'
    );
    expect(stored?.layers).toHaveLength(1);
    expect(stored?.markers).toHaveLength(2);
  });

  it('inlines the payload alongside the ref for small payloads (hosts with no resources/read)', async () => {
    const tool = new RenderMapTool({ httpRequest: vi.fn() });
    const token = tokenFor('account-test-render-map-inline');
    const result = await tool.run(
      {
        summary: 'Inline test',
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
        ],
        markers: [{ coordinates: [-77, 38], style: 'start' }]
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { authInfo: { token } } as any
    );

    expect(result.isError).toBe(false);
    const sc = result.structuredContent as {
      mapboxRender?: {
        ref?: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        layers?: any[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        markers?: any[];
        summary?: string;
      };
    };
    // A host (e.g. ChatGPT) that delivers structuredContent to the iframe
    // but has no resources/read at all can render straight from this,
    // without ever dereferencing sc.mapboxRender.ref.
    expect(sc.mapboxRender?.layers).toHaveLength(1);
    expect(sc.mapboxRender?.layers?.[0]).toMatchObject({ id: 'route' });
    expect(sc.mapboxRender?.markers).toHaveLength(1);
    expect(sc.mapboxRender?.summary).toBe('Inline test');
  });

  it('omits the inline payload for large payloads, keeping only the ref', async () => {
    const tool = new RenderMapTool({ httpRequest: vi.fn() });
    const token = tokenFor('account-test-render-map-large');
    const bigCoordinates: [number, number][] = Array.from(
      { length: 6000 },
      (_, i) => [-77 + i * 0.0001, 38 + i * 0.0001]
    );
    const result = await tool.run(
      {
        summary: 'Huge test',
        layers: [
          {
            id: 'route',
            type: 'line',
            data: {
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: bigCoordinates },
              properties: {}
            }
          }
        ]
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { authInfo: { token } } as any
    );

    expect(result.isError).toBe(false);
    const sc = result.structuredContent as {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mapboxRender?: { ref?: string; layers?: any[] };
    };
    expect(sc.mapboxRender?.ref).toMatch(/^mapbox:\/\/temp\/map-payload-/);
    expect(sc.mapboxRender?.layers).toBeUndefined();
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
    const owner = 'account-test-render-map-ref';
    const ref = storeMapPayload(
      {
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
      },
      owner
    );

    const tool = new RenderMapTool({ httpRequest: vi.fn() });
    const token = tokenFor(owner);
    const result = await tool.run(
      { payload_refs: [ref] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { authInfo: { token } } as any
    );
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
    const owner = 'account-test-render-map-merge';
    const a = storeMapPayload(
      {
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
      },
      owner
    );
    const b = storeMapPayload(
      {
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
      },
      owner
    );

    const tool = new RenderMapTool({ httpRequest: vi.fn() });
    const token = tokenFor(owner);
    const result = await tool.run(
      { payload_refs: [a, b] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { authInfo: { token } } as any
    );
    expect(result.isError).toBe(false);
    const sc = result.structuredContent as {
      layer_count: number;
      summary?: string;
    };
    expect(sc.layer_count).toBe(2);
    expect(sc.summary).toBe('Iso A · Iso B');
  });
});
