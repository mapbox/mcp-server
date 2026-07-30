# Elicitations

Some tools in this server use the MCP [elicitations](https://modelcontextprotocol.io/docs/concepts/elicitation) feature to ask the user for input during tool execution — for example, letting the user pick between multiple search results or route options, rather than having the model choose unilaterally.

## How it works

Each tool that uses elicitations calls `server.elicitInput(...)` directly and wraps the call in a `try`/`catch`. There is no capability pre-check or connection-time gating — every tool that can use elicitation is registered unconditionally, and the `catch` block is what makes an individual call fall back gracefully when the connected client doesn't support elicitation or the call otherwise fails. Support is therefore determined entirely by how the specific client you're using implements the MCP elicitation spec; check your client's own documentation for its current support status rather than relying on any list here, since that can change independently of this server.

If the user **declines** an elicitation prompt (as opposed to the client not supporting elicitation at all), the tool also falls back gracefully — see [Fallback Behavior](#fallback-behavior).

## Tools that use elicitations

### `search_and_geocode_tool`

When a search returns between 2 and 10 results, the tool asks the user to select the correct location before returning it. Each option is labeled with the place name and formatted address.

If the user selects one, the tool also threads that choice into `render_map_tool`'s self-fetch ref (`selectedMapboxId`) so the map preview shows just that result — see [render-map-tool.md](./render-map-tool.md).

### `directions_tool`

When the Directions API returns two or more route alternatives, the tool asks the user to pick one before returning a result. Each option is labeled with duration, distance, primary roads, a rough traffic-conditions indicator, and any incident count.

If the user selects one, the tool returns only that route, and threads the selected route's position in the original alternatives array (`selectedRouteIndex`) into the self-fetch ref, so the map preview draws the same route rather than whichever the API happens to return first on the client's independent re-fetch.

> Route identity isn't stable across separate API calls the way a search result's `mapbox_id` is — there's no unique ID to key off. `selectedRouteIndex` is a best-effort position-based match: if the map preview's own re-fetch (which can return different alternatives, e.g. under `driving-traffic` as live conditions shift) doesn't have that many routes anymore, it falls back to the first one rather than erroring.

## Fallback behavior

| Tool                      | Client doesn't support elicitation, or the call errors | User declines the prompt       |
| ------------------------- | ------------------------------------------------------ | ------------------------------ |
| `search_and_geocode_tool` | Returns all matching results                           | Returns all matching results   |
| `directions_tool`         | Returns all route alternatives                         | Returns all route alternatives |

Either way, the tool always completes with a usable, non-error result — elicitation is a UX enhancement layered on top of the normal response, not a requirement for the tool to function. Elicitation failures are logged at `warning` level (or silently swallowed where a client's own UI treats any logged notification during a tool call as a visible failure) rather than surfaced as tool errors.

---

For questions or issues, please [open an issue](https://github.com/mapbox/mcp-server/issues) on GitHub.
