# VS Code Setup

This guide explains how to configure VS Code for use with the Mapbox MCP Server.

## Requirements

- VS Code installed and configured with copilot
- Mapbox MCP Server built locally

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

### Configure Claude to use Mapbox MCP Server

1. Go to your `settings.json`
1. At the top level add MCP config, for example:

```json
    "mcp": {
        "servers": {
            "mapbox-docker": {
                "type": "stdio",
                "command": "docker",
                "args": [
                    "run",
                    "-i",
                    "--rm",
                    "mapbox-mcp-server"
                ],
                "env": {
                    "MAPBOX_ACCESS_TOKEN": "YOUR_TOKEN"
                }
            },

            "mapbox-node": {
                "type": "stdio",
                "command": "/Users/username/.nvm/versions/node/v22.3.0/bin/node",
                "args": [
                    "/YOUR_PATH_TO_GIT_REPOSITORY/dist/index.js"
                ],
                "env": {
                    "MAPBOX_ACCESS_TOKEN": "YOUR_TOKEN"
                }
            }
        },
    },
```

Note, either docker or node is sufficient, above contains both just for example.

You might need to restart VS Code. You should see Mapbox Server appear in tools menu.
