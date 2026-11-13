// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { renderHint } from '../../src/utils/storeMapPayload.js';

describe('renderHint', () => {
  it('gives the exact render_map_tool call for the ref', () => {
    expect(renderHint('mapbox://temp/abc')).toContain(
      'render_map_tool({ "payload_refs": ["mapbox://temp/abc"] })'
    );
  });

  // A second render_map_tool call opens a second map next to the open one.
  it('points at the open map first when there is one', () => {
    expect(renderHint('mapbox://temp/abc')).toContain('redraw_map');
  });
});
