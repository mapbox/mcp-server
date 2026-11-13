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

  // "Show coffee shops on it" opened a second map next to the open one.
  it('sends changes to an open map to its own tools', () => {
    const text = buildServerInstructions(['render_map_tool']);
    expect(text).toContain('search_map');
    expect(text).toContain('render_map_tool would open a second map');
  });

  // Agents building a site with a map asked the user for a token instead
  // of knowing the server could provide one (#281).
  it('points page building at list_public_tokens_tool when it is enabled', () => {
    expect(buildServerInstructions(getAllTools().map((t) => t.name))).toContain(
      'list_public_tokens_tool'
    );
    expect(buildServerInstructions(['render_map_tool'])).not.toContain(
      'list_public_tokens_tool'
    );
  });

  // In Codex, "preview this tile" got the tile decoded with shell commands
  // until the instructions named mvt_preview_tool.
  it('routes .mvt files to mvt_preview_tool when it is enabled', () => {
    expect(buildServerInstructions(getAllTools().map((t) => t.name))).toContain(
      'call mvt_preview_tool with its absolute path'
    );
    expect(buildServerInstructions(['render_map_tool'])).not.toContain(
      'mvt_preview_tool'
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
