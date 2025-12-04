# Building ChatGPT Apps with Mapbox MCP Server

This guide shows how to use the Mapbox MCP server to build ChatGPT Apps with interactive map widgets.

## What You'll Build

When you ask ChatGPT "Find coffee shops near Times Square", instead of just text, you'll see an interactive Mapbox map with markers for each location.

**Widget-enabled tools:**

- `category_search_tool` - Search for places by category (restaurants, hotels, etc.)
- `search_and_geocode_tool` - Search for specific places or addresses
- `directions_tool` - Get routes between locations
- `isochrone_tool` - Show reachable areas within a time/distance

---

## Quick Start

### 1. Set Environment Variables

```bash
# Required
export MAPBOX_ACCESS_TOKEN=pk.xxx  # Your Mapbox public token

# Enable widget support for ChatGPT Apps
export ENABLE_CHATGPT_WIDGETS=true
```

### 2. Build Widgets

```bash
cd widgets && npm install && npm run build && cd ..
```

This builds the map widget that displays search results, routes, and isochrones. The widget uses your `MAPBOX_ACCESS_TOKEN` for client-side map rendering.

### 3. Start the HTTP Server

```bash
npm run dev:http
```

This starts the MCP server on `http://localhost:3000/mcp`.

### 4. Expose via ngrok

```bash
ngrok http 3000
```

Copy the `https://xxx.ngrok.io` URL.

### 5. Register in ChatGPT

1. Go to [ChatGPT Apps](https://chatgpt.com/gpts/mine)
2. Create a new GPT or edit an existing one
3. Add an Action with your ngrok URL + `/mcp`
4. Save and test

---

## Example Prompts

Try these single-tool prompts to see the map widgets in action:

### Category Search

```
Find coffee shops near Times Square, New York
```

**Result:** Interactive map with coffee shop markers

### Directions

```
Get walking directions from Central Park to Brooklyn Bridge
```

**Result:** Interactive map with route and waypoints

### Isochrone (Reachable Areas)

```
Show me areas reachable within 15 minutes walking from Grand Central Terminal
```

**Result:** Interactive map with colored polygon showing reachable area

### Search/Geocode

```
Where is the Empire State Building?
```

**Result:** Interactive map with marker at the location

---

## Known Limitations

### Multi-Tool = Multi-Widget

Each tool call produces its own widget (iframe). If you ask:

> "Find coffee shops near me and get directions to the closest one"

ChatGPT will call two tools:

1. `category_search_tool` → Map with coffee shop markers
2. `directions_tool` → Map with route

**Result:** Two separate maps appear in the conversation.

This is expected behavior in the ChatGPT Apps platform. For a cleaner UX, use single-purpose prompts like the examples above.

---

## How It Works

### Architecture Overview

```
User Prompt → ChatGPT → MCP Tool Call → Mapbox MCP Server
                                              │
                            ┌─────────────────┴─────────────────┐
                            │         Tool Response              │
                            │  {                                 │
                            │    content: [text],                │
                            │    structuredContent: { data },    │
                            │    _meta: { outputTemplate }       │
                            │  }                                 │
                            └─────────────────┬─────────────────┘
                                              │
                                              ▼
                    ChatGPT requests widget template (text/html+skybridge)
                                              │
                                              ▼
                    Widget renders interactive Mapbox GL map
```

### Key Concepts

| Component                     | Purpose                                        |
| ----------------------------- | ---------------------------------------------- |
| `content`                     | Text for ChatGPT to narrate to the user        |
| `structuredContent`           | JSON data the widget displays                  |
| `_meta.openai/outputTemplate` | URI to the widget HTML template                |
| `text/html+skybridge`         | Special MIME type for ChatGPT widget templates |

### Files

| File                           | Purpose                            |
| ------------------------------ | ---------------------------------- |
| `src/http-server.ts`           | HTTP server for ChatGPT Apps       |
| `src/widgets/widgetUtils.ts`   | Widget response helpers            |
| `widgets/src/map-widget/`      | React map widget component         |
| `widgets/dist/map-widget.html` | Built widget (self-contained HTML) |

---

## Building Your Own Widgets

To create custom widgets for your tools, see the OpenAI documentation:

- [Build your MCP server](https://developers.openai.com/apps-sdk/build/mcp-server/)
- [Build your ChatGPT UI](https://developers.openai.com/apps-sdk/build/chatgpt-ui/)
- [MCP Concepts](https://developers.openai.com/apps-sdk/concepts/mcp-server/)

### Local Widget Development

The `widgets/` directory is a standalone React project for building widget UI. You can develop and test widgets locally without ChatGPT:

**Development Server (Port 4444)**

```bash
cd widgets
npm install
npm run dev      # Start Vite dev server on http://localhost:4444
```

Port 4444 is used to avoid conflicts with the main MCP server (port 3000), allowing you to run both simultaneously.

**Build & Test Workflow**

1. Make changes to widget source in `widgets/src/`
2. Run `npm run dev` for hot-reload during development
3. Run `npm run build` to generate `widgets/dist/map-widget.html`
4. The MCP server automatically serves the built widget via MCP resources

This separation lets you iterate on widget UI without needing ChatGPT connected.

### Widget API

The widget is a React component that reads from `window.openai`:

```typescript
// Access tool output data
const toolOutput = window.openai?.toolOutput;

// Access metadata (widget-specific data)
const meta = window.openai?.toolResponseMetadata;
const widgetData = meta?.widgetData;
```

To build the widget locally:

```bash
cd widgets
npm install
npm run build
```

---

## Troubleshooting

### Widget not appearing

1. Ensure `ENABLE_CHATGPT_WIDGETS=true` is set
2. Check that the HTTP server is running (`npm run dev:http`)
3. Verify ngrok is forwarding to port 3000
4. Check browser console for errors

### Map not loading

1. Verify `MAPBOX_ACCESS_TOKEN` is set and valid
2. Check that the token has the required scopes

### Connection refused

1. Ensure the server is running on port 3000
2. Check that ngrok tunnel is active
3. Verify the URL in ChatGPT matches your ngrok URL

---

## Environment Variables Reference

| Variable                 | Required | Default | Description                              |
| ------------------------ | -------- | ------- | ---------------------------------------- |
| `MAPBOX_ACCESS_TOKEN`    | Yes      | -       | Mapbox public access token               |
| `ENABLE_CHATGPT_WIDGETS` | No       | `false` | Enable widget responses for ChatGPT Apps |
| `PORT`                   | No       | `3000`  | HTTP server port                         |

---

## Token Security

The Mapbox access token is used in two places:

| Usage             | Location                  | Visible to Users?      |
| ----------------- | ------------------------- | ---------------------- |
| **API calls**     | MCP server (server-side)  | No                     |
| **Map rendering** | Widget HTML (client-side) | Yes - embedded in HTML |

When you run `npm run build` in the `widgets/` directory, your `MAPBOX_ACCESS_TOKEN` is embedded into the widget HTML for client-side map tile loading.

**Recommendations:**

- Use a **public token** (`pk.*`) - these are designed for client-side use and can be restricted by URL
- Never use a **secret token** (`sk.*`) as it would be exposed in the widget HTML
- Configure [URL restrictions](https://docs.mapbox.com/accounts/guides/tokens/#url-restrictions) on your token for additional security
