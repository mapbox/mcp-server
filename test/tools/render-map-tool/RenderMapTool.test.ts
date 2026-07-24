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
    // Small merged payloads get a self-describing mapbox://inline/ ref
    // rather than the ephemeral store — nothing server-side to lose on a
    // restart, which matters for Claude Desktop specifically (it strips
    // structuredContent and depends on resources/read against this exact
    // ref). See inlinePayloadRef.ts.
    expect(sc.mapboxRender?.ref).toMatch(/^mapbox:\/\/inline\/payload\?data=/);
    const { resolveInlinePayloadRef } =
      await import('../../../src/utils/inlinePayloadRef.js');
    const stored = resolveInlinePayloadRef(sc.mapboxRender!.ref!);
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

  it('tells the LLM to re-run upstream tools when all payload_refs are stale/unknown', async () => {
    const tool = new RenderMapTool({ httpRequest: vi.fn() });
    const result = await tool.run(
      { payload_refs: ['mapbox://temp/map-payload-does-not-exist'] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { authInfo: { token: tokenFor('account-test-render-map-stale') } } as any
    );
    expect(result.isError).toBe(true);
    const text = (
      result.content[0] as { type: 'text'; text: string }
    ).text.toLowerCase();
    expect(text).toContain('expired');
    expect(text).toContain('re-run the tool');
  });

  it('renders with a note when some payload_refs resolve and others are stale', async () => {
    const { storeMapPayload } =
      await import('../../../src/utils/storeMapPayload.js');
    const owner = 'account-test-render-map-partial';
    const goodRef = storeMapPayload(
      {
        summary: 'Still fresh',
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
      { payload_refs: [goodRef, 'mapbox://temp/map-payload-stale-one'] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { authInfo: { token } } as any
    );
    expect(result.isError).toBe(false);
    const sc = result.structuredContent as { layer_count: number };
    expect(sc.layer_count).toBe(1);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('1 payload ref could not be resolved');
    expect(text).toContain('Re-run the source tool');
  });

  it('renders a union_tool compute ref with no owner and no prior server-side state (simulated restart)', async () => {
    const { buildComputeRef } =
      await import('../../../src/utils/computeRef.js');
    const ref = buildComputeRef('union', [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [2, 0],
              [2, 2],
              [0, 2],
              [0, 0]
            ]
          ]
        }
      },
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [1, 1],
              [3, 1],
              [3, 3],
              [1, 3],
              [1, 1]
            ]
          ]
        }
      }
    ]);

    const tool = new RenderMapTool({ httpRequest: vi.fn() });
    // Deliberately no authInfo/owner — a compute ref carries its own
    // inputs, so unlike a mapbox://temp/ ref it never needs one to resolve.
    const result = await tool.run({ payload_refs: [ref] });

    expect(result.isError).toBe(false);
    const sc = result.structuredContent as { layer_count: number };
    // 2 inputs × (fill + line) + result (fill + line) = 6 layers
    expect(sc.layer_count).toBe(6);
  });

  it('passes through a directions self-fetch ref with no owner and no prior server-side state (simulated restart)', async () => {
    const { buildSelfFetchRef } =
      await import('../../../src/utils/selfFetchRef.js');
    const ref = buildSelfFetchRef('directions', {
      coordinates: [
        { longitude: -77, latitude: 38 },
        { longitude: -76, latitude: 39 }
      ],
      routing_profile: 'mapbox/driving-traffic'
    });

    const tool = new RenderMapTool({ httpRequest: vi.fn() });
    // Deliberately no authInfo/owner — a self-fetch ref carries its own
    // params, so unlike a mapbox://temp/ ref it never needs one to resolve.
    const result = await tool.run({ payload_refs: [ref] });

    expect(result.isError).toBe(false);
    const sc = result.structuredContent as {
      layer_count: number;
      mapboxRender?: { selfFetch?: unknown[] };
    };
    // No layers server-side — the iframe fetches and draws the route
    // itself once it loads.
    expect(sc.layer_count).toBe(0);
    expect(sc.mapboxRender?.selfFetch).toEqual([
      {
        tool: 'directions',
        params: expect.objectContaining({
          routing_profile: 'mapbox/driving-traffic'
        })
      }
    ]);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('will also fetch and draw');
  });

  it('passes through an isochrone self-fetch ref with no owner and no prior server-side state (simulated restart)', async () => {
    const { buildSelfFetchRef } =
      await import('../../../src/utils/selfFetchRef.js');
    const ref = buildSelfFetchRef('isochrone', {
      coordinates: { longitude: -74.006, latitude: 40.7128 },
      profile: 'mapbox/driving',
      contours_minutes: [10]
    });

    const tool = new RenderMapTool({ httpRequest: vi.fn() });
    const result = await tool.run({ payload_refs: [ref] });

    expect(result.isError).toBe(false);
    const sc = result.structuredContent as {
      layer_count: number;
      mapboxRender?: { selfFetch?: unknown[] };
    };
    expect(sc.layer_count).toBe(0);
    expect(sc.mapboxRender?.selfFetch).toEqual([
      {
        tool: 'isochrone',
        params: expect.objectContaining({
          profile: 'mapbox/driving',
          contours_minutes: [10]
        })
      }
    ]);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('will also fetch and draw');
  });
});
