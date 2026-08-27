// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { InlineResponseResource } from '../../../src/resources/inline-response/InlineResponseResource.js';
import { buildInlineResponseRef } from '../../../src/utils/inlineResponseRef.js';

describe('InlineResponseResource', () => {
  it('resolves a large directions_tool response via the real resources/read path with zero prior server-side state — the actual fix for the hosted multi-task follow-up bug', async () => {
    const resource = new InlineResponseResource();
    const ref = buildInlineResponseRef('directions', {
      routes: [
        {
          distance: 671000,
          duration: 26400,
          geometry: {
            type: 'LineString',
            coordinates: [
              [-0.1278, 51.5074],
              [-3.1883, 55.9533]
            ]
          }
        }
      ],
      waypoints: [
        { location: [-0.1278, 51.5074] },
        { location: [-3.1883, 55.9533] }
      ]
    });

    // This `read()` call has no dependency whatsoever on whatever process
    // originally computed the route — no store, no cache, no owner check —
    // so it succeeds identically whether it's the same process, a restarted
    // one, or (the real-world case this fixes) a completely different
    // hosted ECS task than the one that handled the original tool call.
    const result = await resource.read(ref);

    expect(result.contents[0].mimeType).toBe('application/json');
    const data = JSON.parse(result.contents[0].text as string);
    expect(data.routes[0].distance).toBe(671000);
    expect(data.routes[0].geometry.coordinates).toHaveLength(2);
  });

  it('resolves an isochrone_tool response the same way', async () => {
    const resource = new InlineResponseResource();
    const ref = buildInlineResponseRef('isochrone', {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { contour: 10 } }]
    });

    const result = await resource.read(ref);

    const data = JSON.parse(result.contents[0].text as string);
    expect(data.features).toHaveLength(1);
  });

  it('returns a text/plain explanation (not a crash) for a malformed ref', async () => {
    const resource = new InlineResponseResource();
    const result = await resource.read(
      'mapbox://inline-response/directions?data=!!!'
    );

    expect(result.contents[0].mimeType).toBe('text/plain');
    expect(result.contents[0].text).toContain('malformed');
  });
});
