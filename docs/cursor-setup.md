# Cursor Setup

This guide explains how to configure Cursor IDE for use with the Mapbox MCP Server.

## Requirements

- [Cursor](https://www.cursor.com/) installed
- Mapbox MCP Server [built locally](../README.md#Inspecting-server)

```sh
# from repository root:
# using node
npm run build

# note your absolute path to node, you will need it for MCP config
# For Mac/Linux
which node
# For Windows
where node

# or alternatively, using docker
docker build -t mapbox-mcp-server .
```

## Setup Instructions

### Configure Cursor to use Mapbox MCP Server

1. Go to Cursor Settings/ MCP Tools and click on "Add Custom MCP".
2. Add either of the following MCP config:

   - NPM version
     ```json
     {
       "mcpServers": {
         "MapboxServer": {
           "type": "stdio",
           "command": "<PATH_TO_YOUR_NPX>",
           "args": ["-y", "@mapbox/mcp-server"],
           "env": {
             "MAPBOX_ACCESS_TOKEN": "<YOUR_TOKEN>"
           }
         }
       }
     }
     ```
   - Docker version
     ```json
     {
       "mcpServers": {
         "MapboxServer": {
           "type": "stdio",
           "command": "docker",
           "args": ["run", "-i", "--rm", "mapbox-mcp-server"],
           "env": {
             "MAPBOX_ACCESS_TOKEN": "<YOUR_TOKEN>"
           }
         }
       }
     }
     ```
   - Node version
     ```json
     {
       "mcpServers": {
         "MapboxServer": {
           "type": "stdio",
           "command": "<PATH_TO_YOUR_NODE>",
           "args": ["/YOUR_PATH_TO_GIT_REPOSITORY/dist/esm/index.js"],
           "env": {
             "MAPBOX_ACCESS_TOKEN": "<YOUR_TOKEN>"
           }
         }
       }
     }
     ```

   3. Click "Save" to apply the configuration.

## MCP-UI Support

Cursor IDE does not currently support the MCP-UI specification for embedded interactive elements. When you use tools like `static_map_image_tool`, you'll receive:

- ✅ **Base64-encoded map images** that Cursor can display
- ❌ **Interactive iframe embeds** (not supported by Cursor IDE)

The server is fully backwards compatible - all tools work normally, you just won't see interactive map embeds. For more information about MCP-UI support in this server, see the [MCP-UI documentation](mcp-ui.md).
