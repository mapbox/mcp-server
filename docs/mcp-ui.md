# Interactive Map Previews (MCP Apps & MCP-UI)

This document covers how the Mapbox MCP Server delivers interactive map previews in compatible clients.

## Table of Contents

- [Overview](#overview)
- [Supported Tools](#supported-tools)
- [Compatible Clients](#compatible-clients)
- [How It Works](#how-it-works)
- [Configuration](#configuration)
- [Technical Details](#technical-details)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## Overview

The Mapbox MCP Server actively invests in **MCP Apps** as its primary interactive preview protocol. MCP Apps serves self-contained HTML app panels directly inside the chat, and is supported by Claude Desktop, VS Code with GitHub Copilot, and Claude Code.

The server also maintains support for **MCP-UI** for backwards compatibility with clients like Goose. MCP-UI is not being removed, but new interactive preview development is focused on MCP Apps.

All clients — regardless of protocol support — receive the base64-encoded map image as standard output.

### Key Benefits

- **Rich interactive previews**: MCP Apps clients get a full HTML map panel with a Fullscreen toggle
- **Full backwards compatibility**: Clients without MCP Apps or MCP-UI support still receive the base64 image
- **Progressive enhancement**: Every client gets a usable result; supporting clients get a richer experience

## Supported Tools

### Static Map Image Tool (`static_map_image_tool`)

This tool always returns:

1. **The Mapbox Static Images API URL** (text, required first for MCP Apps to render)
2. **Base64-encoded map image** (for all clients without interactive preview support)
3. **MCP-UI UIResource** (only when MCP-UI is enabled, for Goose and other MCP-UI clients)

**MCP Apps clients** (Claude Desktop, VS Code, Claude Code): Render the interactive HTML panel served by `StaticMapUIResource`, with click-to-zoom and a Fullscreen toggle.

**MCP-UI clients** (Goose): Render the embedded iframe resource.

**Standard clients**: Display the base64 image inline.

## Compatible Clients

### MCP Apps Compatible ✅

- **Claude Desktop** - Interactive map panel with Fullscreen toggle
- **VS Code with GitHub Copilot** - Interactive map panel with Fullscreen toggle
- **Claude Code** - Interactive map panel with Fullscreen toggle

### MCP-UI Compatible ✅

- **[Goose](https://github.com/block/goose)** - AI agent framework with inline map visualization via embedded iframe

### Standard (base64 image only)

- **Cursor IDE** - Renders the base64 map image
- **Other MCP clients** - Render the base64 map image

> **Note**: Client compatibility may change as adoption of both protocols grows. Check your client's documentation for the latest support status.

## How It Works

### Architecture

```
┌─────────────────┐
│   MCP Client    │
│  (e.g., Goose)  │
└────────┬────────┘
         │
         │ MCP Protocol
         │
┌────────▼────────────────────┐
│  Mapbox MCP Server          │
│  ┌────────────────────────┐ │
│  │ static_map_image_tool  │ │
│  └────────┬───────────────┘ │
│           │                  │
│           ├─► Text description│
│           │   (always)       │
│           ├─► Base64 image   │
│           │   (always)       │
│           └─► UIResource     │
│               (if enabled)   │
└─────────────────────────────┘
```

### Response Format

The `static_map_image_tool` returns a response with multiple content items, following the progressive enhancement pattern:

```typescript
{
  content: [
    {
      // The Mapbox Static Images API URL — MCP Apps reads this to render the map
      type: 'text',
      text: 'https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/...'
    },
    {
      // Base64-encoded image — for all clients without interactive preview support
      type: 'image',
      data: '<base64-encoded-image>',
      mimeType: 'image/png'
    },
    {
      // MCP-UI resource for interactive iframes — only present when MCP-UI is enabled
      type: 'resource',
      resource: {
        uri: 'ui://mapbox/static-map/...',
        mimeType: 'text/html',
        text: '...',
        uiMetadata: {
          'preferred-frame-size': ['800px', '600px']
        }
      }
    }
  ];
}
```

**MCP Apps clients** (Claude Desktop, VS Code, Claude Code) render the interactive HTML panel served via `StaticMapUIResource`. The URL in `content[0]` is used by the panel to fetch and display the map image.

**MCP-UI clients** (Goose) render the iframe resource for an inline preview.

**Standard clients** (Cursor, etc.) render the base64 image from `content[1]`.

## Configuration

MCP-UI is **enabled by default**. You can disable it using either an environment variable or command-line flag.

### Disable via Environment Variable

```bash
export ENABLE_MCP_UI=false
npm run build
```

Or in your client configuration:

**Claude Desktop (`claude_desktop_config.json`):**

```json
{
  "mcpServers": {
    "mapbox": {
      "command": "npx",
      "args": ["-y", "@mapbox/mcp-server"],
      "env": {
        "MAPBOX_ACCESS_TOKEN": "your_token_here",
        "ENABLE_MCP_UI": "false"
      }
    }
  }
}
```

**VS Code (`settings.json`):**

```json
{
  "mcp": {
    "servers": {
      "MapboxServer": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@mapbox/mcp-server"],
        "env": {
          "MAPBOX_ACCESS_TOKEN": "your_token",
          "ENABLE_MCP_UI": "false"
        }
      }
    }
  }
}
```

### Disable via Command-Line Flag

```bash
npx @mapbox/mcp-server --disable-mcp-ui
```

Or in your client configuration:

**Claude Desktop:**

```json
{
  "mcpServers": {
    "mapbox": {
      "command": "npx",
      "args": ["-y", "@mapbox/mcp-server", "--disable-mcp-ui"],
      "env": {
        "MAPBOX_ACCESS_TOKEN": "your_token_here"
      }
    }
  }
}
```

### Priority

If both the environment variable and command-line flag are specified, the **environment variable takes precedence**.

## Technical Details

### Implementation

The Mapbox MCP Server supports two interactive preview protocols:

- **MCP Apps** (`@modelcontextprotocol/ext-apps`) — serves a self-contained HTML app via `StaticMapUIResource` with `RESOURCE_MIME_TYPE` (`text/html;profile=mcp-app`). Supported by Claude Desktop, VS Code, and Claude Code.
- **MCP-UI** (`@mcp-ui/server`) — creates `UIResource` objects with embedded iframe URLs. Supported by Goose.

**Key Files:**

- `src/config/toolConfig.ts` - Configuration logic for MCP-UI (`isMcpUiEnabled()` helper)
- `src/tools/static-map-image-tool/StaticMapImageTool.ts` - Fetch + base64 encoding, URL as first content item, conditional UIResource
- `src/resources/ui-apps/StaticMapUIResource.ts` - MCP Apps HTML panel implementation
- `src/tools/BaseTool.ts` - `meta.ui` property for MCP Apps CSP configuration

**Code Example:**

```typescript
import { createUIResource } from '@mcp-ui/server';
import { isMcpUiEnabled } from '../../config/toolConfig.js';

// content[0] MUST be the URL — MCP Apps UI finds it via content.find(c => c.type === 'text')
const content: CallToolResult['content'] = [
  {
    type: 'text',
    text: url // Mapbox Static Images API URL
  },
  {
    type: 'image',
    data: base64Data,
    mimeType
  }
];

// Conditionally add MCP-UI resource if enabled (for Goose and other MCP-UI clients)
if (isMcpUiEnabled()) {
  const uiResource = createUIResource({
    uri: `ui://mapbox/static-map/${input.style}/${lng},${lat},${input.zoom}`,
    content: {
      type: 'externalUrl',
      iframeUrl: url
    },
    encoding: 'text',
    uiMetadata: {
      'preferred-frame-size': [`${width}px`, `${height}px`]
    }
  });
  content.push(uiResource);
}

return { content, isError: false };
```

### UIResource Structure

The UIResource includes:

- **uri**: Unique identifier for the resource (e.g., `ui://mapbox/static-map/...`)
- **content.type**: Set to `'externalUrl'` to indicate an iframe
- **content.iframeUrl**: The actual URL to embed (Mapbox Static Images API URL)
- **encoding**: Set to `'text'`
- **uiMetadata**: Optional metadata including preferred dimensions

## Examples

### Using Goose with MCP-UI

1. Install Goose (follow [Goose installation instructions](https://github.com/block/goose))

2. Configure the Mapbox MCP Server in Goose's configuration

3. Use natural language to request a map:

   ```
   "Show me a map of downtown San Francisco centered at 37.7749, -122.4194"
   ```

4. Goose will display an **inline interactive map** rather than just a static image

### Example Prompt for Static Map Tool

```
Create a map showing the route from Golden Gate Bridge to Fisherman's Wharf
with markers at both locations
```

**MCP Apps clients (Claude Desktop, VS Code, Claude Code):**

- Displays interactive HTML map panel with Fullscreen toggle

**MCP-UI clients (Goose):**

- Displays interactive embedded map via iframe

**Standard clients (Cursor, etc.):**

- Displays base64-encoded static PNG image

All clients provide the same map information; the experience differs based on client capabilities.

## Troubleshooting

### "I'm not seeing interactive maps, only static images"

**Solution**: Check that:

1. Your MCP client supports MCP-UI (see [Compatible Clients](#compatible-clients))
2. MCP-UI is enabled (check environment variable and command-line flags)
3. Your client is properly configured to render MCP-UI resources

### "How do I verify MCP-UI is enabled?"

**Solution**: Check the server logs or test with a known MCP-UI compatible client like Goose. When MCP-UI is enabled, the `static_map_image_tool` will return 3 content items (URL text + image + UIResource) instead of 2 (URL text + image).

### "Can I use MCP-UI with custom tools?"

**Solution**: Yes! If you're developing custom tools for this server:

1. Add dependency: `@mcp-ui/server`
2. Import `createUIResource` and `isMcpUiEnabled()`
3. Conditionally add UIResource to your tool's response
4. Follow the pattern in `StaticMapImageTool.ts`

### "Does disabling MCP-UI affect functionality?"

**Solution**: No. Disabling MCP-UI only removes the iframe URLs from responses. All tools continue to function normally, returning their standard output (text, images, JSON, etc.).

## Resources

- [MCP-UI Specification](https://github.com/modelcontextprotocol/mcp-ui) - Official MCP-UI documentation
- [Goose Documentation](https://github.com/block/goose) - MCP-UI compatible AI agent
- [Mapbox Static Images API](https://docs.mapbox.com/api/maps/static-images/) - API used for map rendering

---

For questions or issues related to MCP-UI support, please [open an issue](https://github.com/mapbox/mcp-server/issues) on GitHub.
