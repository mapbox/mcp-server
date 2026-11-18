# Mapbox MCP Server

[![npm version](https://img.shields.io/npm/v/@mapbox/mcp-server)](https://www.npmjs.com/package/@mapbox/mcp-server)

Node.js server implementing Model Context Protocol (MCP) for Mapbox APIs: geocoding, POI search, routing, travel time matrices, isochrones, interactive maps and offline geospatial calculations for AI agents and applications.

**Hosted endpoint:** https://mcp.mapbox.com/mcp (a Mapbox access token is required)

**See [servers/mcp-server](./servers/mcp-server/README.md) for setup, integration guides and the full list of tools.**

## Repository layout

This repo is a [pnpm](https://pnpm.io) workspace.

| Folder                                     | npm package                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| [servers/mcp-server](./servers/mcp-server) | [`@mapbox/mcp-server`](https://www.npmjs.com/package/@mapbox/mcp-server) |

```sh
pnpm install
pnpm build
pnpm test
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

[MIT License](LICENSE.md)
