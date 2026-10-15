// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { buildServerInstructions } from '../../src/utils/serverInstructions.js';
import { getAllTools } from '../../src/tools/toolRegistry.js';

describe('buildServerInstructions', () => {
  // Regression: in Claude Desktop, which lists only tool names until a tool
  // is loaded, the model picked static_map_image_tool to "show a map"
  // because nothing visible up front pointed it at render_map_tool.
  it('routes map display to render_map_tool with every tool enabled', () => {
    const text = buildServerInstructions(getAllTools().map((t) => t.name));
    expect(text).toContain('use render_map_tool');
    expect(text).toContain('mapboxRender.ref');
    expect(text).toContain('Never write or edit a ref by hand');
    expect(text).toContain(
      'static_map_image_tool only when the user explicitly asks'
    );
  });

  it('omits the static image rule when that tool is disabled', () => {
    const text = buildServerInstructions(['render_map_tool', 'isochrone_tool']);
    expect(text).toContain('use render_map_tool');
    expect(text).not.toContain('static_map_image_tool');
  });

  it('returns no instructions when render_map_tool is disabled', () => {
    expect(
      buildServerInstructions(['static_map_image_tool', 'isochrone_tool'])
    ).toBeUndefined();
  });
});
