# `render_map_tool`: the Mapbox map visualization primitive

`render_map_tool` displays a live, interactive Mapbox GL JS map inside any MCP client that supports **MCP Apps**. It is the single visualization primitive for this server — every other Mapbox tool that produces geospatial output hands its result to this one tool to actually draw it, and **you can call it directly with your own data too**, without any other Mapbox tool involved at all.

## Table of Contents

- [Overview](#overview)
- [Two ways to use it](#two-ways-to-use-it)
- [Standalone usage: visualize your own data](#standalone-usage-visualize-your-own-data)
- [Chained usage: rendering another tool's result](#chained-usage-rendering-another-tools-result)
- [Payload reference](#payload-reference)
- [Compatible clients](#compatible-clients)
- [Notes for third-party integrators](#notes-for-third-party-integrators)
- [Troubleshooting](#troubleshooting)

## Overview

`render_map_tool` takes a small JSON payload describing what to draw — layers, markers, a legend, an optional camera position — and renders it as a live Mapbox GL JS map in a self-contained HTML panel (via the [MCP Apps](https://github.com/modelcontextprotocol/ext-apps) protocol). It's intentionally the _only_ tool in this server that declares an MCP Apps UI resource. Two reasons for that:

1. **Chain-position limitation**: several MCP App hosts (Claude Desktop among them) only fully render the interactive panel for the _last_ tool call in a sequence. Funneling every visualization through one terminal tool means the map always renders, regardless of how many other tools ran first.
2. **Token efficiency**: geometry (a route polyline, a set of isochrone contours, a polygon boundary) can be tens of thousands of coordinate pairs. Passing it through the model as tool-call arguments is slow and expensive. The other Mapbox tools in this server avoid that by stashing their result behind a short reference string (`payload_refs`) instead of inlining the geometry — but this is an optimization, not a requirement. You're always free to pass geometry inline instead.

## Two ways to use it

| Mode           | When to use it                                                                                     | What you pass                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Chained**    | Visualizing a result from another Mapbox tool in this server (directions, isochrone, search, etc.) | `payload_refs`: one or more reference strings from that tool's `structuredContent.mapboxRender.ref` |
| **Standalone** | Visualizing your own GeoJSON — data from your own database, a third-party API, a file, anything    | `layers` / `markers` / `legend` / `camera`, composed directly from your data                        |

Both modes use the exact same tool, and can be combined in one call (e.g. inline markers layered on top of a chained route). Nothing about the standalone path is a fallback or a lesser-supported mode — it's the same code path other Mapbox tools use internally.

## Standalone usage: visualize your own data

This is the case most third-party integrators care about: you have your own geospatial data (a delivery zone, a set of store locations, a GPS trace, anything expressible as GeoJSON) and want to show it on a live Mapbox map inside an MCP conversation, without calling any other tool in this server first.

Call `render_map_tool` directly with `layers` and/or `markers`:

```json
{
  "summary": "Downtown delivery zone",
  "layers": [
    {
      "id": "delivery-zone",
      "type": "fill",
      "data": {
        "type": "Feature",
        "geometry": {
          "type": "Polygon",
          "coordinates": [
            [
              [-122.4194, 37.7749],
              [-122.4094, 37.7749],
              [-122.4094, 37.7849],
              [-122.4194, 37.7849],
              [-122.4194, 37.7749]
            ]
          ]
        },
        "properties": {}
      },
      "paint": {
        "fill-color": "#3b82f6",
        "fill-opacity": 0.25,
        "fill-outline-color": "#1d4ed8"
      }
    }
  ],
  "markers": [
    {
      "coordinates": [-122.4144, 37.7799],
      "style": "pin",
      "color": "#ef4444",
      "popup": "Warehouse"
    }
  ],
  "legend": [{ "label": "Delivery zone", "color": "#3b82f6", "opacity": 0.25 }]
}
```

No `payload_refs`, no dependency on `directions_tool`/`isochrone_tool`/etc. — the map renders exactly this polygon and marker. This is the whole request; there's nothing else to configure.

**As a natural-language prompt**, this looks like: _"Using the Mapbox map render tool, show a fill polygon over these four coordinates: [...], with a red pin at [...] labeled 'Warehouse'."_ An LLM with access to this tool can compose the JSON payload itself from a plain-language description of your data — you don't need to hand it pre-built GeoJSON if the model already has (or can derive) the coordinates.

Multiple layers and markers in one call are merged onto the same map and the camera auto-fits to the union of everything drawn, unless you provide an explicit `camera`.

## Chained usage: rendering another tool's result

When another tool in this server returns geospatial data, its `structuredContent` includes a `mapboxRender.ref` field:

```json
{
  "structuredContent": {
    "routes": [
      /* ... */
    ],
    "mapboxRender": { "ref": "mapbox://selffetch/directions?data=..." }
  }
}
```

Pass that ref straight through:

```json
{ "payload_refs": ["mapbox://selffetch/directions?data=..."] }
```

Pass multiple refs to merge several tool results onto one map — for example, an isochrone plus a route:

```json
{
  "payload_refs": [
    "mapbox://selffetch/isochrone?data=...",
    "mapbox://selffetch/directions?data=..."
  ]
}
```

An LLM using this server is instructed (via each tool's own output) to call `render_map_tool` as the final step whenever a `mapboxRender` field is present — you generally don't need to prompt for this explicitly.

## Payload reference

All fields are optional; provide whichever combination fits what you're drawing.

| Field          | Type       | Description                                                                                  |
| -------------- | ---------- | -------------------------------------------------------------------------------------------- |
| `payload_refs` | `string[]` | Reference strings from other tools' `mapboxRender.ref`. Merges with any inline fields below. |
| `summary`      | `string`   | Short header chip shown top-left on the map (e.g. `"Route: 12.4 mi, 23 min"`).               |
| `layers`       | array      | Inline GL JS layers — see below.                                                             |
| `markers`      | array      | Inline point markers — see below.                                                            |
| `legend`       | array      | Inline legend rows — see below.                                                              |
| `camera`       | object     | Initial camera position. If omitted, the map auto-fits to everything drawn.                  |

**`layers[]`** — one entry per Mapbox GL JS source+layer pair:

| Field    | Type                                       | Description                                                                                                                                                                       |
| -------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`     | `string`                                   | Unique id within the payload (used as both source id and layer id).                                                                                                               |
| `type`   | `"fill" \| "line" \| "circle" \| "symbol"` | Mapbox GL layer type.                                                                                                                                                             |
| `data`   | GeoJSON `Feature` or `FeatureCollection`   | Geometry must be `Point`, `LineString`, `Polygon`, or `MultiPolygon`. Coordinates are `[longitude, latitude]`.                                                                    |
| `paint`  | object                                     | [Mapbox Style Spec](https://docs.mapbox.com/style-spec/reference/layers/) paint object, passed through to `addLayer` as-is (e.g. `{ "line-color": "#3b82f6", "line-width": 5 }`). |
| `layout` | object                                     | Style Spec layout object (e.g. `{ "line-join": "round", "line-cap": "round" }`).                                                                                                  |

**`markers[]`** — one entry per point marker:

| Field         | Type                                      | Description                                                                                                                                                       |
| ------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `coordinates` | `[number, number]`                        | `[longitude, latitude]`.                                                                                                                                          |
| `style`       | `"pin" \| "numbered" \| "start" \| "end"` | `pin` is the default Mapbox marker. `numbered` is a circular badge containing `label` (e.g. visit order). `start`/`end` are green/red badges for route endpoints. |
| `label`       | `string`                                  | Required when `style` is `"numbered"`.                                                                                                                            |
| `color`       | `string`                                  | CSS color override; defaults are style-derived.                                                                                                                   |
| `popup`       | `string`                                  | Text shown when the marker is clicked.                                                                                                                            |

**`legend[]`** — one entry per legend row:

| Field     | Type           | Description       |
| --------- | -------------- | ----------------- |
| `label`   | `string`       | Row label.        |
| `color`   | `string`       | Swatch CSS color. |
| `opacity` | `number` (0-1) | Swatch opacity.   |

**`camera`**:

| Field    | Type                                   | Description                                                                                             |
| -------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `center` | `[number, number]`                     | `[longitude, latitude]`.                                                                                |
| `zoom`   | `number`                               | Zoom level.                                                                                             |
| `bounds` | `[[number, number], [number, number]]` | `[[minLng, minLat], [maxLng, maxLat]]`. Takes precedence over `center`/`zoom` and over auto-fit if set. |

The payload format is intentionally a thin pass-through to the Mapbox Style Spec rather than its own DSL — anything expressible as a GL JS `paint`/`layout` object is expressible here, so you're not limited to a fixed set of pre-baked styles.

## Compatible clients

`render_map_tool` renders via **MCP Apps** (`@modelcontextprotocol/ext-apps`). Hosts that support it show a live, interactive map with a Fullscreen toggle:

- **Claude Desktop** ✅
- **VS Code with GitHub Copilot** ✅
- **Claude Code** ✅
- **[Goose](https://github.com/block/goose)** ✅

In a client without MCP Apps support, `render_map_tool`'s text/JSON output (the resolved payload) is still returned as the tool result — you lose the live interactive panel, but the call doesn't fail. If you need a guaranteed visual image regardless of client capability, use `static_map_image_tool` instead, which returns a base64-encoded PNG/JPEG that every client can display.

## Notes for third-party integrators

- **You don't need any other Mapbox tool.** `render_map_tool` accepts arbitrary standalone GeoJSON through `layers`/`markers`. Nothing about `payload_refs` is required.
- **You don't need a Mapbox access token to reason about the payload shape** — token handling for rendering (fetching map tiles) happens entirely inside the host's iframe, using this server's own public-token resolution. Your `layers`/`markers` are plain GeoJSON/CSS values with no credentials embedded.
- **Geometry size**: very large inline payloads (tens of thousands of coordinates) are still passed through the model as tool arguments in standalone mode, unlike the internal `payload_refs` optimization other tools use. For most use cases (a handful of markers, a modest polygon or route) this is a non-issue; if you're regularly rendering very large geometries, consider simplifying them first (see `simplify_tool`) before passing them to `render_map_tool`.
- **Multiple calls**: each call to `render_map_tool` performs a fresh render — it does not accumulate state across calls. Merge everything you want on one map into a single call's `layers`/`markers`/`payload_refs`.

## Troubleshooting

### "I'm not seeing an interactive map, just text/JSON"

Check that your client supports MCP Apps (see [Compatible clients](#compatible-clients)). Clients without support still receive the resolved payload as a tool result, just not the rendered panel.

### "My inline layer isn't drawing anything"

Confirm `data` is a valid GeoJSON `Feature` or `FeatureCollection` with `Point`, `LineString`, `Polygon`, or `MultiPolygon` geometry, and that `type` (`fill`/`line`/`circle`/`symbol`) matches the geometry — for example, a `Polygon` needs `type: "fill"` or `"line"`, not `"symbol"`.

### "I want a guaranteed image even in clients without MCP Apps support"

Use `static_map_image_tool` — it always returns a base64-encoded PNG/JPEG, with no dependency on MCP Apps support, so every client gets a usable result.

---

For questions or issues, please [open an issue](https://github.com/mapbox/mcp-server/issues) on GitHub.
