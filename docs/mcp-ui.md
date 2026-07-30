# Interactive Map Previews

> **This document previously described MCP-UI support.** As of the `render_map_tool` release (v0.13.0), MCP-UI support (`@mcp-ui/server`) has been removed from this server entirely — it is no longer a dependency, and no tool emits an MCP-UI resource. Interactive map previews are now handled exclusively through **[`render_map_tool`](./render-map-tool.md)** via the MCP Apps protocol. This page is kept at its existing URL to avoid breaking old links; see [render-map-tool.md](./render-map-tool.md) for the current, comprehensive guide.

## What changed

- **Before**: `static_map_image_tool` conditionally attached an MCP-UI `UIResource` (an embedded iframe) alongside its base64 image, and separately declared an MCP Apps resource (`StaticMapUIResource`) for hosts that supported it. Both were controlled by the `ENABLE_MCP_UI` env var / `--disable-mcp-ui` CLI flag.
- **Now**: `static_map_image_tool` returns the Mapbox Static Images API URL (as text) and a base64-encoded image only — a plain, static result with no interactive panel of its own. Live, interactive map rendering is the responsibility of the single dedicated visualization tool, `render_map_tool`, which every geospatial tool in this server (including one you compose yourself from raw GeoJSON) can feed into.
- The `ENABLE_MCP_UI` environment variable and `--disable-mcp-ui` CLI flag still parse without error for backwards compatibility, but no longer have any effect — there is nothing left for them to toggle.

## Where to go instead

- **[`render_map_tool` guide](./render-map-tool.md)** — the current interactive map preview mechanism, including how to call it standalone with your own data (no other Mapbox tool required) or chained from another tool's result.
- **`static_map_image_tool`** — still the right choice when you need a guaranteed image in _every_ client regardless of MCP Apps support (e.g. a client with no interactive-preview capability at all).

## Why the change

MCP Apps and MCP-UI solved the same problem (interactive previews) with two different protocols, which meant every visualization-producing tool needed to carry both integrations, decide when to attach which, and keep them in sync. Consolidating all interactive rendering behind one tool (`render_map_tool`) removed that duplication and fixed a real bug in the process: individual tools' own MCP Apps resources only rendered reliably as the _last_ tool call in a chain in some hosts, which `render_map_tool`'s terminal-tool design sidesteps entirely (see [render-map-tool.md](./render-map-tool.md#overview)).

---

For questions or issues, please [open an issue](https://github.com/mapbox/mcp-server/issues) on GitHub.
