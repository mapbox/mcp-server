// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { InlinePayloadResource } from '../../../src/resources/inline-payload/InlinePayloadResource.js';
import { buildInlinePayloadRef } from '../../../src/utils/inlinePayloadRef.js';

describe('InlinePayloadResource', () => {
  it("resolves render_map_tool's self-describing merged ref via the real resources/read path with zero prior server-side state", async () => {
    const resource = new InlinePayloadResource();
    const ref = buildInlinePayloadRef({
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
          }
        }
      ],
      markers: [{ coordinates: [-77, 38], style: 'start' }]
    });

    const result = await resource.read(ref);

    expect(result.contents[0].mimeType).toBe('application/json');
    const payload = JSON.parse(result.contents[0].text as string);
    expect(payload.summary).toBe('Test trip');
    expect(payload.layers).toHaveLength(1);
    expect(payload.markers).toHaveLength(1);
  });

  it('returns a text/plain explanation (not a crash) for a malformed ref', async () => {
    const resource = new InlinePayloadResource();
    const result = await resource.read('mapbox://inline/payload?data=!!!');

    expect(result.contents[0].mimeType).toBe('text/plain');
    expect(result.contents[0].text).toContain('malformed');
  });
});
