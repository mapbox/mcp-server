// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Server-level `instructions` returned from `initialize`.
 *
 * Hosts that load tools lazily (Claude Desktop, Claude Code) list only tool
 * names until the model loads a tool, so tool descriptions can't steer
 * which tool gets picked — e.g. a model asked to "show a map" loaded
 * static_map_image_tool because of its name and never saw
 * render_map_tool's "ALWAYS use this tool to display maps". Server
 * instructions are shown up front, so the routing rule lives here.
 */
export function buildServerInstructions(
  enabledToolNames: readonly string[]
): string | undefined {
  if (!enabledToolNames.includes('render_map_tool')) return undefined;
  const lines = [
    'To show anything on a map, use render_map_tool: it renders an interactive Mapbox GL JS map inline.',
    'When a tool result includes mapboxRender.ref, pass that ref unchanged in render_map_tool payload_refs (several refs can share one map). Never write or edit a ref by hand.'
  ];
  if (enabledToolNames.includes('static_map_image_tool')) {
    lines.push(
      'Use static_map_image_tool only when the user explicitly asks for a static image file (PNG/JPEG), never as the default way to show a map.'
    );
  }
  return lines.join('\n');
}
