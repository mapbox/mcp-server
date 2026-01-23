# MCP-UI Support

This document provides comprehensive information about MCP-UI support in the Mapbox MCP Server.

## Table of Contents

- [What is MCP-UI?](#what-is-mcp-ui)
- [Supported Tools](#supported-tools)
- [Compatible Clients](#compatible-clients)
- [How It Works](#how-it-works)
- [Configuration](#configuration)
- [Technical Details](#technical-details)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## What is MCP-UI?

**MCP-UI** is an open specification that extends the Model Context Protocol (MCP) to support rich, interactive UI elements within MCP client applications. It enables MCP servers to return not just text and data, but also embeddable UI components like iframes, which compatible clients can render inline.

### Key Benefits

- **Enhanced User Experience**: Display interactive maps, charts, and visualizations directly in the chat interface
- **Full Backwards Compatibility**: Clients without MCP-UI support continue to work normally, receiving standard text and image responses
- **Progressive Enhancement**: Tools provide baseline functionality for all clients, with enhanced visual experiences for MCP-UI-compatible clients

## Supported Tools

The following tools in the Mapbox MCP Server support MCP-UI:

### Static Map Image Tool (`static_map_image_tool`)

When MCP-UI is enabled, this tool returns:

1. **Base64-encoded map image** (for all clients)
2. **Embeddable iframe URL** (for MCP-UI compatible clients)

**Without MCP-UI**: Clients receive only the base64 image data, which they can display as a static image.

**With MCP-UI**: Compatible clients can render an interactive iframe showing the map directly from Mapbox's Static Images API, potentially with additional interactivity depending on the client's implementation.

## Compatible Clients

### MCP-UI Compatible ✅

- **[Goose](https://github.com/block/goose)** - AI agent framework with full MCP-UI support for inline map visualization

### Not Yet Compatible ❌

- **Claude Desktop** - Does not support MCP-UI (displays base64 images only)
- **VS Code with Copilot** - Does not support MCP-UI (displays base64 images only)
- **Cursor IDE** - Does not support MCP-UI (displays base64 images only)

> **Note**: Client compatibility may change as MCP-UI adoption grows. Check with your specific client's documentation for the latest support status.

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
      // Text description for clients that don't support image content type
      type: 'text',
      text: 'Static map image generated successfully.\nCenter: 37.7749, -122.4194\nZoom: 13\nSize: 800x600\nStyle: mapbox/streets-v12'
    },
    {
      // Base64-encoded image for clients that support image content
      type: 'image',
      data: '<base64-encoded-image>',
      mimeType: 'image/png'
    },
    {
      // MCP-UI resource for clients that support interactive iframes (only when enabled)
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

**Text-only clients** (like LibreChat) display the text description with map metadata.

**Image-capable clients** (like Claude Desktop) render the base64 image and may ignore the text.

**MCP-UI clients** (like Goose) can render the interactive iframe resource for the richest experience.

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

The Mapbox MCP Server uses the `@mcp-ui/server` package (v5.13.1+) to create UIResource objects.

**Key Files:**

- `src/config/toolConfig.ts` - Configuration logic for MCP-UI (`isMcpUiEnabled()` helper)
- `src/tools/static-map-image-tool/StaticMapImageTool.ts` - Conditional UIResource creation

**Code Example:**

```typescript
import { createUIResource } from '@mcp-ui/server';
import { isMcpUiEnabled } from '../../config/toolConfig.js';

// Build descriptive text for clients that don't support image content type
const textDescription = [
  'Static map image generated successfully.',
  `Center: ${lat}, ${lng}`,
  `Zoom: ${input.zoom}`,
  `Size: ${width}x${height}`,
  `Style: ${input.style}`
].join('\n');

// Build content array with text first (for compatibility), then image
const content: CallToolResult['content'] = [
  {
    type: 'text',
    text: textDescription
  },
  {
    type: 'image',
    data: base64Data,
    mimeType
  }
];

// Conditionally add MCP-UI resource if enabled
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

**With MCP-UI Client (Goose):**

- Displays interactive embedded map in the chat

**Without MCP-UI Client (Claude Desktop):**

- Displays base64-encoded static PNG image

Both provide the same information, but the experience differs based on client capabilities.

## Troubleshooting

### "I'm not seeing interactive maps, only static images"

**Solution**: Check that:

1. Your MCP client supports MCP-UI (see [Compatible Clients](#compatible-clients))
2. MCP-UI is enabled (check environment variable and command-line flags)
3. Your client is properly configured to render MCP-UI resources

### "How do I verify MCP-UI is enabled?"

**Solution**: Check the server logs or test with a known MCP-UI compatible client like Goose. When MCP-UI is enabled, the `static_map_image_tool` will return 2 content items instead of 1.

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
