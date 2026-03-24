# Elicitations

Some tools in this server use the MCP [elicitations](https://modelcontextprotocol.io/docs/concepts/elicitation) feature to ask the user for input during tool execution. This enables a more interactive experience — for example, letting the user choose between multiple routes or disambiguate between search results — rather than having the AI model make that choice unilaterally.

## Client Support

Elicitations require the MCP client to support the feature. The server detects this automatically at connection time by checking `clientCapabilities.elicitation`.

**Clients with known elicitation support:**

- Claude Desktop
- Claude Code

**Clients without elicitation support** receive the standard tool responses with no interactive prompts (see [Fallback Behavior](#fallback-behavior) below).

## Tools That Use Elicitations

### `directions_tool`

The directions tool uses a two-stage elicitation pattern.

**Stage 1 — Routing preferences (before the API call)**

When the request is a simple A→B route with no exclusions already specified, the tool asks the user to choose routing preferences before making the API call:

- Fastest route (tolls permitted)
- Avoid tolls
- Avoid highways
- Avoid ferries

This ensures the API call is made with the right parameters from the start, rather than requiring a second call if the user's preferences aren't met.

> Stage 1 only triggers for two-waypoint routes with no `exclude` parameter already set.

**Stage 2 — Route selection (after the API call)**

When the API returns two or more route alternatives, the tool presents each option with its duration, distance, primary roads, traffic conditions, and any incidents, and asks the user to pick one. Only the selected route is returned.

> Stage 2 only triggers when two or more routes are returned.

**Fallback behavior:** If elicitations are unavailable or the user declines, Stage 1 uses the default routing parameters and Stage 2 returns all available routes for the AI model to evaluate.

---

### `search_and_geocode_tool`

When a search returns between 2 and 10 results, the tool asks the user to select the correct location before returning it. Each option is labeled with the place name and formatted address.

**Fallback behavior:** If elicitations are unavailable or the user declines, all results are returned for the AI model to evaluate.

## Fallback Behavior

When a client does not support elicitations, or when the user declines an elicitation prompt, the tools fall back gracefully:

| Tool                      | Without elicitations            |
| ------------------------- | ------------------------------- |
| `directions_tool` Stage 1 | Uses default routing parameters |
| `directions_tool` Stage 2 | Returns all route alternatives  |
| `search_and_geocode_tool` | Returns all matching results    |

Elicitation failures (e.g., network or protocol errors) are caught and logged at `warning` level — the tool always completes with a usable result.
