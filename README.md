# Mapbox MCP Server

[![npm version](https://img.shields.io/npm/v/@mapbox/mcp-server)](https://www.npmjs.com/package/@mapbox/mcp-server)

Node.js server implementing Model Context Protocol (MCP) for Mapbox APIs.

## Unlock Geospatial Intelligence for Your AI Applications

The Mapbox MCP Server transforms any AI agent or application into a geospatially-aware system by providing seamless access to Mapbox's comprehensive location intelligence platform. With this server, your AI can understand and reason about places, navigate the physical world, and access rich geospatial data including:

- **Global geocoding** to convert addresses and place names to coordinates and vice versa
- **Points of interest (POI) search** across millions of businesses, landmarks, and places worldwide
- **Multi-modal routing** for driving, walking, and cycling with real-time traffic
- **Travel time matrices** to analyze accessibility and optimize logistics
- **Route optimization** to find the optimal visiting order for multiple stops (traveling salesman problem)
- **Map matching** to snap GPS traces to the road network for clean route visualization
- **Isochrone generation** to visualize areas reachable within specific time or distance constraints
- **Static map images** to create visual representations of locations, routes, and geographic data
- **Offline geospatial calculations** for distance, area, bearing, buffers, and spatial analysis without requiring API calls

Whether you're building an AI travel assistant, logistics optimizer, location-based recommender, or any application that needs to understand "where", the Mapbox MCP Server provides the spatial intelligence to make it possible. You can also enable it on popular clients like Claude Desktop and VS Code. See below for details

![Mapbox MCP Server Demo](./assets/mapbox_mcp_server.gif)

# Usage

**A Mapbox access token is required to use this MCP server.**

## Hosted MCP Endpoint

For quick access, you can use our hosted MCP endpoint:

**Endpoint**: https://mcp.mapbox.com/mcp

For detailed setup instructions for different clients and API usage, see the [Hosted MCP Server Guide](./docs/hosted-mcp-guide.md).

To get a Mapbox access token:

1. Sign up for a free Mapbox account at [mapbox.com/signup](https://www.mapbox.com/signup/)
2. Navigate to your [Account page](https://account.mapbox.com/)
3. Create a new token or use the default public token

For more information about Mapbox access tokens, see the [Mapbox documentation on access tokens](https://docs.mapbox.com/help/dive-deeper/access-tokens/).

## Integration Guides

For detailed setup instructions for different integrations, refer to the following guides:

- [Claude Desktop Setup](./docs/claude-desktop-setup.md) - Instructions for configuring Claude Desktop to work with this MCP server
- [Goose Setup](./docs/goose-setup.md) - Setting up Goose AI agent framework with MCP-UI support
- [VS Code Setup](./docs/vscode-setup.md) - Setting up a development environment in Visual Studio Code
- [Cursor AI IDE Setup](./docs/cursor-setup.md) - Setting up a development environment in Cursor AI IDE
- [Smolagents Integration](./docs/using-mcp-with-smolagents/README.md) - Example showing how to connect Smolagents AI agents to Mapbox's tools

## Example Prompts

Try these prompts with Claude Desktop or other MCP clients after setup:

### Location Discovery

- "Find coffee shops within walking distance of the Empire State Building"
- "Show me gas stations along the route from Boston to New York"
- "What restaurants are near Times Square?"

### Navigation & Travel

- "Get driving directions from LAX to Hollywood with current traffic"
- "How long would it take to walk from Central Park to Times Square?"
- "Calculate travel time from my hotel (Four Seasons) to JFK Airport by taxi during rush hour"

### Visualization & Maps

- "Create a map image showing the route from Golden Gate Bridge to Fisherman's Wharf with markers at both locations"
- "Show me a satellite view of Manhattan with key landmarks marked"
- "Generate a map highlighting all Starbucks locations within a mile of downtown Seattle"

### Analysis & Planning

- "Show me areas reachable within 30 minutes of downtown Portland by car"
- "Calculate a travel time matrix between these 3 hotel locations (Marriott, Sheraton and Hilton) and the convention center in Denver"
- "Find the optimal route visiting these 3 tourist attractions (Golden Gate, Musical Stairs and Fisherman's Wharf) in San Francisco"
- "Optimize a delivery route for these 8 addresses: [list of addresses]"

### GPS & Route Matching

- "Clean up this GPS trace and show the actual route on roads: [list of coordinates with timestamps]"
- "Snap this recorded bicycle ride to the cycling network: [GPS coordinates]"
- "Match this driving route to the road network and show traffic congestion levels"

### Offline Geospatial Calculations

- "What's the distance in miles between these two coordinates?"
- "Calculate the area of this polygon in square kilometers"
- "Is the point at 37.7749°N, 122.4194°W inside this service area polygon?"
- "What's the bearing from San Francisco to New York?"
- "Find the midpoint between London and Paris"
- "Create a 5-mile buffer zone around this location"
- "Calculate the centroid of this neighborhood boundary"
- "What's the bounding box for these route coordinates?"
- "Simplify this complex polygon to reduce the number of points"

### Tips for Better Results

- Be specific about locations (use full addresses or landmark names)
- Specify your preferred travel method (driving, walking, cycling)
- Include time constraints when relevant ("during rush hour", "at 3 PM")
- Ask for specific output formats when needed ("as a map image", "in JSON format")

## Resources

The MCP server exposes static reference data as **MCP resources**. Resources provide read-only access to data that clients can reference directly without making tool calls.

### Available Resources

#### Mapbox Categories Resource

**URI Pattern**: `mapbox://categories` or `mapbox://categories/{language}`

Access the complete list of available category IDs for use with the category search tool. Categories can be used to filter search results by type (e.g., "restaurant", "hotel", "gas_station").

**Examples**:

- `mapbox://categories` - Default (English) category list
- `mapbox://categories/ja` - Japanese category names
- `mapbox://categories/es` - Spanish category names

**Accessing Resources**:

- **Clients with native MCP resource support**: Use the `resources/read` MCP protocol method
- **Clients without resource support**: Use the `resource_reader_tool` with the resource URI

## MCP-UI Support

This MCP server supports **MCP-UI**, an open specification that allows compatible clients to render interactive UI elements like embedded iframes. This provides a richer visual experience while maintaining full backwards compatibility with clients that don't support MCP-UI.

### What is MCP-UI?

MCP-UI enables tools to return interactive UI resources alongside their standard output. Compatible clients can render these as embedded iframes, while clients without MCP-UI support simply ignore them and use the standard output.

### Supported Tools

- **Static Map Image Tool**: Returns both image data and an embeddable iframe URL for inline map visualization

### Benefits

- **Enhanced Experience**: Compatible clients (e.g., Goose) can display maps inline without leaving the chat
- **Backwards Compatible**: Non-supporting clients (e.g., Claude Desktop) continue working unchanged
- **No Configuration Required**: MCP-UI is enabled by default

### Configuration

MCP-UI is **enabled by default**. To disable it:

**Via Environment Variable:**

```bash
ENABLE_MCP_UI=false npm run build
```

**Via Command-Line Flag:**

```bash
node dist/esm/index.js --disable-mcp-ui
```

**In Claude Desktop config:**

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

**For more detailed information**, including compatible clients, technical implementation details, and troubleshooting, see the [MCP-UI documentation](./docs/mcp-ui.md).

## Tools

### Utility Tools

#### Resource Reader Tool

Provides access to MCP resources for clients that don't support the native MCP resource API. Use this tool to read resources like the category list.

**Parameters**:

- `uri`: The resource URI to read (e.g., `mapbox://categories`, `mapbox://categories/ja`)

**Example Usage**:

- Read default categories: `{"uri": "mapbox://categories"}`
- Read Japanese categories: `{"uri": "mapbox://categories/ja"}`

**Note**: If your MCP client supports native resources, prefer using the resource API directly for better performance.

### Offline Geospatial Tools

These tools perform geospatial calculations completely offline without requiring Mapbox API calls. They use [Turf.js](https://turfjs.org/) for accurate geographic computations and work anywhere, even without internet connectivity.

#### Distance Tool

Calculate the distance between two geographic coordinates using the Haversine formula.

**Features**:

- Supports multiple units: kilometers, miles, meters, feet, nautical miles
- Accurate great-circle distance calculation
- No API calls required

**Example Usage**: "What's the distance between San Francisco (37.7749°N, 122.4194°W) and New York (40.7128°N, 74.0060°W)?"

#### Point in Polygon Tool

Test whether a point is inside a polygon or multipolygon.

**Features**:

- Works with complex polygons including holes
- Supports multipolygons
- Useful for geofencing and service area checks

**Example Usage**: "Is this delivery address inside our service area?"

#### Bearing Tool

Calculate the compass direction (bearing) from one coordinate to another.

**Features**:

- Returns bearing in degrees (0-360°)
- Provides cardinal direction (N, NE, E, SE, S, SW, W, NW)
- Useful for navigation and directional queries

**Example Usage**: "What direction should I head to go from here to the airport?"

#### Midpoint Tool

Find the geographic midpoint between two coordinates along the great circle path.

**Features**:

- Calculates true midpoint on Earth's curved surface
- Useful for meeting point suggestions
- Handles long-distance calculations correctly

**Example Usage**: "What's halfway between San Francisco and New York?"

#### Centroid Tool

Calculate the geometric center (centroid) of a polygon or multipolygon.

**Features**:

- Works with complex shapes
- Returns arithmetic mean of all points
- Useful for placing labels or markers

**Example Usage**: "Where should I place a marker for this neighborhood boundary?"

#### Area Tool

Calculate the area of a polygon.

**Features**:

- Supports multiple units: square meters, square kilometers, acres, hectares, square miles, square feet
- Accurate area calculation on Earth's surface
- Works with polygons of any size

**Example Usage**: "What's the area of this park in acres?"

#### Bounding Box Tool

Calculate the minimum bounding box (bbox) that contains a geometry.

**Features**:

- Works with points, lines, polygons, and multipolygons
- Returns [minLongitude, minLatitude, maxLongitude, maxLatitude]
- Useful for viewport calculations and spatial indexing

**Example Usage**: "What's the bounding box for this route?"

#### Buffer Tool

Create a buffer zone (polygon) around a point, line, or polygon.

**Features**:

- Supports multiple distance units
- Creates circular buffers around points
- Useful for proximity analysis and creating zones of influence

**Example Usage**: "Show me a 5km buffer zone around this location"

#### Simplify Tool

Reduce the number of vertices in a line or polygon using the Douglas-Peucker algorithm.

**Features**:

- Configurable tolerance for detail level
- Preserves overall shape while reducing complexity
- Useful for reducing file sizes and improving rendering performance
- Option to maintain topology (prevent self-intersections)

**Example Usage**: "Simplify this complex boundary to reduce the number of points"

### Mapbox API Tools

#### Category List Tool (Deprecated)

**⚠️ Deprecated**: Use the `resource_reader_tool` with URI `mapbox://categories` instead, or access the `mapbox://categories` resource directly if your client supports MCP resources.

This tool is maintained for backward compatibility with clients that don't support MCP resources or the resource_reader_tool.

#### Matrix Tool

Calculates travel times and distances between multiple points using [Mapbox Matrix API](https://www.mapbox.com/matrix-api). Features include:

- Efficient one-to-many, many-to-one or many-to-many routing calculations
- Support for different travel profiles (driving-traffic, driving, walking, cycling)
- Departure time specification for traffic-aware calculations
- Route summarization with distance and duration metrics
- Control approach (curb/unrestricted) and range of allowed departure bearings

#### Static image tool

Generates static map images using the [Mapbox static image API](https://docs.mapbox.com/api/maps/static-images/). Features include:

- Custom map styles (streets, outdoors, satellite, etc.)
- Adjustable image dimensions and zoom levels
- Support for multiple markers with custom colors and labels
- Overlay options including polylines and polygons
- Auto-fitting to specified coordinates

#### Category search tool

Performs a category search using the [Mapbox Search Box category search API](https://docs.mapbox.com/api/search/search-box/#category-search). Features include:

- Search for points of interest by category (restaurants, hotels, gas stations, etc.)
- Filtering by geographic proximity
- Customizable result limits
- Rich metadata for each result
- Support for multiple languages

#### Reverse geocoding tool

Performs reverse geocoding using the [Mapbox geocoding V6 API](https://docs.mapbox.com/api/search/geocoding/#reverse-geocoding). Features include:

- Convert geographic coordinates to human-readable addresses
- Customizable levels of detail (street, neighborhood, city, etc.)
- Results filtering by type (address, poi, neighborhood, etc.)
- Support for multiple languages
- Rich location context information

#### Directions tool

Fetches routing directions using the [Mapbox Directions API](https://docs.mapbox.com/api/navigation/directions/). Features include:

- Support for different routing profiles: driving (with live traffic or typical), walking, and cycling
- Route from multiple waypoints (2-25 coordinate pairs)
- Alternative routes option
- Route annotations (distance, duration, speed, congestion)
- Scheduling options:
  - Future departure time (`depart_at`) for driving and driving-traffic profiles
  - Desired arrival time (`arrive_by`) for driving profile only
- Profile-specific optimizations:
  - Driving: vehicle dimension constraints (height, width, weight)
- Exclusion options for routing:
  - Common exclusions: ferry routes, cash-only tolls
  - Driving-specific exclusions: tolls, motorways, unpaved roads, tunnels, country borders, state borders
  - Custom point exclusions (up to 50 geographic points to avoid)
- GeoJSON geometry output format

#### Isochrone tool

Computes areas that are reachable within a specified amount of times from a location using [Mapbox Isochrone API](https://docs.mapbox.com/api/navigation/isochrone/). Features include:

- Support for different travel profiles (driving, walking, cycling)
- Customizable travel times or distances
- Multiple contour generation (e.g., 15, 30, 45 minute ranges)
- Optional departure or arrival time specification
- Color customization for visualization

#### Search and geocode tool

Uses the [Mapbox Search Box Text Search API](https://docs.mapbox.com/api/search/search-box/#search-request) endpoint to power searching for and geocoding POIs, addresses, places, and any other types supported by that API.
This tool consolidates the functionality that was previously provided by the ForwardGeocodeTool and PoiSearchTool (from earlier versions of this MCP server) into a single tool.

#### Map matching tool

Snaps GPS traces to the road network using the [Mapbox Map Matching API](https://docs.mapbox.com/api/navigation/map-matching/). Features include:

- Convert noisy GPS traces to clean routes on the road network
- Support for different travel profiles (driving, driving-traffic, walking, cycling)
- Handle up to 100 coordinate pairs per request
- Optional timestamps for improved accuracy based on speed
- Configurable snap radiuses for different GPS quality levels
- Route annotations (speed limits, distance, duration, traffic congestion)
- Multiple geometry output formats (GeoJSON, polyline)

**Example Usage**: "Clean up this GPS trace and snap it to roads: [coordinates with timestamps]"

#### Optimization tool

Finds the optimal route through multiple locations using the [Mapbox Optimization API](https://docs.mapbox.com/api/navigation/optimization/). Features include:

- Solve traveling salesman problem (TSP) for 2-12 locations
- Support for different travel profiles (driving, driving-traffic, walking, cycling)
- Flexible start and end point configuration
- Roundtrip or one-way trip optimization
- Turn-by-turn navigation instructions (optional)
- Route annotations (distance, duration, speed)
- Multiple geometry output formats (GeoJSON, polyline)

**Example Usage**: "Find the optimal route to visit these 5 stops: [list of addresses or coordinates]"

**Note**: A V2 API with advanced features (time windows, capacity constraints, multiple vehicles) is available but requires beta access. The V2 implementation is included in the codebase but not registered by default.

# Development

## Inspecting server

### Using Node.js

```sh
# Run the built image
npm run inspect:build
```

### Using Docker

```sh
# Build the Docker image
docker build -t mapbox-mcp-server .

# Run and inspect the server
npx @modelcontextprotocol/inspector docker run -i --rm --env MAPBOX_ACCESS_TOKEN="YOUR_TOKEN" mapbox-mcp-server
```

## Create new tool

```sh
npx plop create-tool
# provide tool name without suffix (e.g. Search)
```

## OpenTelemetry Tracing

This MCP server includes comprehensive OpenTelemetry tracing for production observability:

### Quick Demo

```sh
# 1. Copy the example configuration
cp .env.example .env

# 2. Edit .env to add your MAPBOX_ACCESS_TOKEN and configure tracing

# 3. Start Jaeger for local development
npm run tracing:jaeger:start

# 4. Run the server (it will automatically use .env configuration)
npm run inspect:build

# 5. View traces at http://localhost:16686

# 6. Stop Jaeger when done
npm run tracing:jaeger:stop
```

**Note:** The server automatically loads configuration from your `.env` file at startup. The `.env.example` file includes configuration examples for multiple observability platforms.

### Supported Observability Platforms

Configuration examples included in `.env.example` for:

**Cloud Providers:**

- ☁️ AWS X-Ray
- ☁️ Azure Monitor (Application Insights)
- ☁️ Google Cloud Trace

**SaaS Platforms:**

- 📊 Datadog
- 📊 New Relic
- 📊 Honeycomb
- 📊 Any OTLP-compatible backend

### Production Configuration

See [docs/tracing.md](./docs/tracing.md) for complete setup instructions including:

- 🔧 Platform-specific configuration guides
- 📊 Authentication and endpoint setup
- 🎯 Custom trace attributes and context
- 🚀 Performance optimization (minimal overhead)
- 🔍 Troubleshooting and debugging

**Tracing Features:**

- ✅ Configuration loading tracing (.env file loading)
- ✅ Automatic tool execution tracing
- ✅ HTTP request instrumentation with CloudFront correlation IDs
- ✅ Configurable exporters (console, OTLP)
- ✅ Security-conscious (data protection, JWT validation)
- ✅ Production-ready (<1% CPU overhead)

## Contributing

We welcome contributions to the Mapbox MCP Server! Please review our standards and guidelines before contributing:

- **[Engineering Standards (docs/engineering_standards.md)](./docs/engineering_standards.md)** - Complete code quality, testing, documentation, and collaboration standards for all contributors
- **[Claude Code Guide (CLAUDE.md)](./CLAUDE.md)** - Standards and patterns for contributors using Claude Code
- **[AI Agent Instructions (AGENTS.md)](./AGENTS.md)** - Guide for general AI coding assistants (Cursor, Continue, Aider, etc.)
- **[GitHub Copilot Guidelines](./.github/copilot-instructions.md)** - Best practices for using GitHub Copilot responsibly in this project

### Quick Start for Contributors

1. Fork the repository and clone your fork
2. Install dependencies: `npm install`
3. Make your changes following our coding standards
4. Run tests and linting: `npm test && npm run lint`
5. Add tests for any new functionality
6. Submit a pull request with a clear description

All contributions must pass our CI checks and code review process. See [docs/engineering_standards.md](./docs/engineering_standards.md) for detailed requirements.

## Data Usage & Privacy

### What data is sent to Mapbox APIs

When you use the MCP server tools, the following data is sent directly from your environment to Mapbox APIs:

- **Geocoding tools**: Address/location text, coordinates, country/region filters
- **Search tools**: Search queries, location coordinates for proximity, category filters
- **Directions tool**: Start/end coordinates, waypoints, routing preferences, vehicle constraints
- **Matrix tool**: Multiple coordinate pairs, travel profile, departure times
- **Static map tool**: Coordinates, zoom level, styling preferences, marker information
- **Isochrone tool**: Origin coordinates, time/distance parameters, travel profile

### Your privacy

- **Local execution**: All API calls are made directly from your environment to Mapbox APIs
- **Token security**: Your Mapbox API token remains on your local machine and is never transmitted to or stored by this MCP server
- **No data storage**: This MCP server does not store, log, or collect any of your data or API requests
- **Direct communication**: There is no intermediary server between you and Mapbox APIs

### Third-party data usage

- **Mapbox's privacy policy** governs data sent to their APIs: https://www.mapbox.com/legal/privacy/
- **API usage**: Standard Mapbox API terms apply to all requests made through these tools
- **Data retention**: Refer to Mapbox's documentation for their data retention policies

## Support & Contact

### For MCP Server Issues

- **Email**: mcp-feedback@mapbox.com
- **GitHub Issues**: [Report bugs and feature requests](https://github.com/mapbox/mcp-server/issues)

### For Mapbox API Questions

- **Mapbox Support**: https://support.mapbox.com/
- **Documentation**: https://docs.mapbox.com/
- **API Status**: https://status.mapbox.com/

### Maintenance Commitment

This MCP server is officially maintained by Mapbox, Inc. We provide:

- Regular updates for new Mapbox API features
- Bug fixes and security updates
- Compatibility with latest MCP protocol versions
- Community support through GitHub issues

---

[MIT License](LICENSE.md)
