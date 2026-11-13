// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Server-level `instructions` returned from `initialize`.
 *
 * Hosts that load tools lazily (Claude Desktop, Claude Code) list only tool
 * names until the model loads a tool, so tool descriptions can't steer
 * which tool gets picked — e.g. a model asked to "show a map" loaded
 * static_map_image_tool because of its name and never saw
 * render_map_tool's description. Server instructions are shown up front,
 * so the routing rule lives here.
 */
export function buildServerInstructions(
  enabledToolNames: readonly string[]
): string | undefined {
  if (!enabledToolNames.includes('render_map_tool')) return undefined;
  const lines = [
    'To show anything on a map, use render_map_tool: it renders an interactive Mapbox GL JS map inline.',
    'When a tool result includes mapboxRender.ref, pass that ref unchanged in render_map_tool payload_refs (several refs can share one map). Never write or edit a ref by hand.',
    'In ChatGPT Desktop, a Mapbox map stays open next to the chat and provides these tools: redraw_map (same arguments as render_map_tool), search_map, add_places, move_map, read_map. Use them to change the open map ("show coffee shops on it", "add the route"): render_map_tool would open a second map.'
  ];
  if (enabledToolNames.includes('static_map_image_tool')) {
    lines.push(
      'Use static_map_image_tool only when the user explicitly asks for a static image file (PNG/JPEG), never as the default way to show a map.'
    );
  }
  if (enabledToolNames.includes('list_public_tokens_tool')) {
    lines.push(
      "When building a web page or app outside this chat that needs a Mapbox token, call list_public_tokens_tool and put the pk. token it returns in the page. Public tokens are made to ship in browser code, so don't leave a placeholder like YOUR_MAPBOX_TOKEN or ask the user to paste one."
    );
  }
  return lines.join('\n');
}
