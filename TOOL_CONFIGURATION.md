# Tool Configuration Guide

The Mapbox MCP Server supports command-line configuration to enable or disable specific tools at startup.

## Command-Line Options

### --enable-tools

Enable only specific tools (exclusive mode). When this option is used, only the listed tools will be available.

```bash
<command> --enable-tools version_tool,directions_tool
```

### --disable-tools

Disable specific tools. All other tools will remain enabled.

```bash
<command> --disable-tools static_map_image_tool,matrix_tool
```

## Available Tools

The following tools are available in the Mapbox MCP Server:

- `version_tool` - Get version information
- `category_search_tool` - Search for POIs by category
- `directions_tool` - Get directions between locations
- `forward_geocode_tool` - Convert addresses to coordinates
- `isochrone_tool` - Calculate reachable areas from a point
- `matrix_tool` - Calculate travel times between multiple points
- `poi_search_tool` - Search for points of interest
- `reverse_geocode_tool` - Convert coordinates to addresses
- `static_map_image_tool` - Generate static map images

## Usage Examples

### Node.js

```bash
node dist/index.js --enable-tools forward_geocode_tool,reverse_geocode_tool
```

### NPX

```bash
npx @mapbox/mcp-server --disable-tools static_map_image_tool
```

### Docker

```bash
docker run mapbox/mcp-server --enable-tools directions_tool,isochrone_tool,matrix_tool
```

### Claude Desktop App Configuration

In your Claude Desktop configuration file:

```json
{
  "mcpServers": {
    "mapbox": {
      "command": "node",
      "args": [
        "/path/to/index.js",
        "--enable-tools",
        "version_tool,directions_tool"
      ]
    }
  }
}
```

## Notes

- If both `--enable-tools` and `--disable-tools` are provided, `--enable-tools` takes precedence
- Tool names must match exactly (case-sensitive)
- Multiple tools can be specified using comma separation
- Invalid tool names are silently ignored
- Arguments are passed after the main command, regardless of how the server is invoked
