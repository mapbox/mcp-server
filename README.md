# Mapbox MCP Server

[![npm version](https://img.shields.io/npm/v/@mapbox/mcp-server)](https://www.npmjs.com/package/@mapbox/mcp-server)

Node.js server implementing Model Context Protocol (MCP) for Mapbox APIs.

## Unlock Geospatial Intelligence for Your AI Applications

The Mapbox MCP Server transforms any AI agent or application into a geospatially-aware system by providing seamless access to Mapbox's comprehensive location intelligence platform. With this server, your AI can understand and reason about places, navigate the physical world, and access rich geospatial data including:

- **Global geocoding** to convert addresses and place names to coordinates and vice versa
- **Points of interest (POI) search** across millions of businesses, landmarks, and places worldwide
- **Multi-modal routing** for driving, walking, and cycling with real-time traffic
- **Travel time matrices** to analyze accessibility and optimize logistics
- **Isochrone generation** to visualize areas reachable within specific time or distance constraints
- **Static map images** to create visual representations of locations, routes, and geographic data

Whether you're building an AI travel assistant, logistics optimizer, location-based recommender, or any application that needs to understand "where", the Mapbox MCP Server provides the spatial intelligence to make it possible. You can also enable it on popular clients like Claude Desktop and VS Code. See below for details

![Mapbox MCP Server Demo](./assets/mapbox_mcp_server.gif)

# Usage

**A Mapbox access token is required to use this MCP server.**

To get a Mapbox access token:

1. Sign up for a free Mapbox account at [mapbox.com/signup](https://www.mapbox.com/signup/)
2. Navigate to your [Account page](https://account.mapbox.com/)
3. Create a new token or use the default public token

For more information about Mapbox access tokens, see the [Mapbox documentation on access tokens](https://docs.mapbox.com/help/dive-deeper/access-tokens/).

## Integration Guides

For detailed setup instructions for different integrations, refer to the following guides:

- [Claude Desktop Setup](./docs/claude-desktop-setup.md) - Instructions for configuring Claude Desktop to work with this MCP server
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

### Tips for Better Results

- Be specific about locations (use full addresses or landmark names)
- Specify your preferred travel method (driving, walking, cycling)
- Include time constraints when relevant ("during rush hour", "at 3 PM")
- Ask for specific output formats when needed ("as a map image", "in JSON format")

## Tools

### Mapbox API tools

#### Matrix tool

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

#### POI search tool

Finds specific points of interest or brand locations by name using the [Mapbox Search Box forward search API](https://docs.mapbox.com/api/search/search-box/#search-request). Features include:

- Search for specific points of interest by proper name or unique brand (e.g., "Amalie Arena", "Starbucks")
- Find all nearby branches of a brand (e.g., "Macy's stores near me")
- Geographic proximity biasing for more relevant results
- Support for multiple languages and countries

#### Category search tool

Performs a category search using the [Mapbox Search Box category search API](https://docs.mapbox.com/api/search/search-box/#category-search). Features include:

- Search for points of interest by category (restaurants, hotels, gas stations, etc.)
- Filtering by geographic proximity
- Customizable result limits
- Rich metadata for each result
- Support for multiple languages

#### Forward geocoding tool

Performs forward geocoding using the [Mapbox geocoding V6 API](https://docs.mapbox.com/api/search/geocoding/#forward-geocoding-with-search-text-input). Features include:

- Convert addresses or place names to geographic coordinates
- Fuzzy matching for partial or misspelled inputs
- Results filtering by country, region, or bounding box
- Customizable result limits
- Multiple language support

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

# Development

## Inspecting server

### Using Node.js

```sh
# Build
npm run build

# Inspect
npx @modelcontextprotocol/inspector node dist/index.js
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

## Environment Variables

### VERBOSE_ERRORS

Set `VERBOSE_ERRORS=true` to get detailed error messages from the MCP server. This is useful for debugging issues when integrating with MCP clients.

By default, the server returns generic error messages. With verbose errors enabled, you'll receive the actual error details, which can help diagnose API connection issues, invalid parameters, or other problems.

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

[BSD 3-Clause License](LICENSE.md)
