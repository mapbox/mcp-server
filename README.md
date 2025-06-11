# Mapbox MCP Server

Node.js server implementing Model Context Protocol (MCP) for Mapbox APIs.

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
- [Smolagents Integration](./docs/using-mcp-with-smolagents/README.md) - Example showing how to connect Smolagents AI agents to Mapbox's tools

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
  - Walking: customizable walking speed and bias for/against walkways
  - Driving: vehicle dimension constraints (height, width, weight)
- Exclusion options for routing:
  - Common exclusions: ferry routes, cash-only tolls
  - Driving-specific exclusions: tolls, motorways, unpaved roads, tunnels, country borders, state borders
  - Custom point exclusions (up to 50 geographic points to avoid)
- Multiple geometry output formats (GeoJSON, polyline)

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

---

[License](LICENSE.md)
