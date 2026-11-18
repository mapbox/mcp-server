# Goose Setup

This guide explains how to configure Goose AI agent framework with the Mapbox MCP Server.

## Requirements

- [Goose](https://github.com/block/goose) installed on your system
- A Mapbox access token ([get one here](https://account.mapbox.com/))

## Setup Instructions

### 1. Install Goose

Follow the [official Goose installation instructions](https://github.com/block/goose#installation).

### 2. Configure Mapbox MCP Server

Add the Mapbox MCP Server to Goose's configuration file (typically `~/.config/goose/profiles.yaml`):

```yaml
default:
  provider: openai
  processor: gpt-4
  accelerator: gpt-4o-mini
  moderator: passive
  toolkits:
    - name: developer
    - name: mcp
      requires:
        servers:
          - name: mapbox
            command: npx
            args:
              - '-y'
              - '@mapbox/mcp-server'
            env:
              MAPBOX_ACCESS_TOKEN: 'your_token_here'
```

Alternatively, if you've built the server locally:

```yaml
default:
  provider: openai
  processor: gpt-4
  accelerator: gpt-4o-mini
  moderator: passive
  toolkits:
    - name: developer
    - name: mcp
      requires:
        servers:
          - name: mapbox
            command: node
            args:
              - '/path/to/mcp-server/dist/esm/index.js'
            env:
              MAPBOX_ACCESS_TOKEN: 'your_token_here'
```

### 3. Start Goose

```bash
goose session start
```

### 4. Try It Out

Ask Goose to create a map:

```
Show me a map of the Golden Gate Bridge
```

## MCP-UI Support ✨

**Goose supports MCP-UI**, which means you'll see **inline interactive maps** rendered directly in the chat when you use the `static_map_image_tool`. This provides a richer visual experience compared to clients that only display static images.

For more information about MCP-UI features, see the [MCP-UI documentation](mcp-ui.md).

## Troubleshooting

### Maps not appearing?

Verify that:

1. Your Mapbox access token is correct
2. Goose is properly configured (check `~/.config/goose/profiles.yaml`)
3. The MCP server is accessible (check Goose logs)

### Want to disable MCP-UI?

Add the `--disable-mcp-ui` flag to args:

```yaml
args:
  - '-y'
  - '@mapbox/mcp-server'
  - '--disable-mcp-ui'
```

---

For more information about Goose, visit the [official Goose repository](https://github.com/block/goose).
