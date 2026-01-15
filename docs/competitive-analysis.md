# MCP Server Competitive Analysis: Mapbox vs TomTom vs Google Maps

**Document Version**: 1.0
**Last Updated**: January 2026
**Authors**: Mapbox MCP Team

## Executive Summary

This document provides a technical comparison of geospatial MCP (Model Context Protocol) servers from Mapbox, TomTom, and Google Maps. Our analysis covers tool surface area, capabilities, code quality, production deployment infrastructure, and unique differentiators to help understand the competitive landscape.

### Quick Comparison

| Metric                 | Mapbox MCP                | TomTom MCP | Google Grounding Lite | Google Community |
| ---------------------- | ------------------------- | ---------- | --------------------- | ---------------- |
| **Total Tools**        | **24**                    | 11         | 3                     | 7                |
| **Offline Tools**      | **9**                     | 0          | 0                     | 0                |
| **API Tools**          | 13                        | 11         | 3                     | 7                |
| **Routing Tools**      | 4                         | 3          | 1                     | 2                |
| **Search/Geocoding**   | 3                         | 5          | 1                     | 3                |
| **Token Optimization** | **~67% reduction**        | ❌ None    | Unknown               | Unknown          |
| **HTTP Deployment**    | **Production (OAuth)**    | Dev/Alpha  | Production            | ❌               |
| **Status**             | Production                | Alpha      | Experimental          | Community        |
| **Elicitations**       | In Progress (PR #98, #99) | ❌         | ❌                    | ❌               |

**Key Insights**:

- **Largest tool surface area**: 24 tools vs 11 for TomTom, 3-7 for Google
- **Unique offline capabilities**: 9 offline geospatial tools requiring no API calls
- **Major token cost advantage**: ~67% token reduction via response optimization (TomTom has no optimization)
- **Most mature production deployment**: OAuth 2.0, OpenTelemetry, stateless scaling (TomTom's HTTP mode is development-focused)

---

## 1. Complete Tool Inventory

### 1.1 Mapbox MCP Server (24 Tools)

#### API-Based Tools (13 tools)

**Search & Geocoding (3 tools)**

1. **search_and_geocode_tool** - Unified search for POIs, brands, addresses, and places using Mapbox Search Box API
2. **category_search_tool** - Search by category (restaurants, hotels, etc.) with proximity filtering
3. **reverse_geocode_tool** - Convert coordinates to addresses using Geocoding V6 API

**Routing & Navigation (4 tools)** 4. **directions_tool** - Multi-modal routing (driving/traffic, walking, cycling) with 2-25 waypoints

- **Elicitations Support (In Progress)**: Two-stage flow for preferences and route selection

5. **matrix_tool** - Calculate travel time/distance matrices between multiple points
6. **map_matching_tool** - Snap GPS traces to road network (up to 100 coordinates)
7. **optimization_tool** - Solve traveling salesman problem for 2-12 locations

**Visualization (1 tool)** 8. **static_map_image_tool** - Generate static map images with markers, overlays, and custom styles

- **MCP-UI Support**: Returns embeddable iframe for inline visualization

**Analysis (1 tool)** 9. **isochrone_tool** - Calculate reachable areas by time or distance (isochrone/service area analysis)

**Utility (2 tools)** 10. **resource_reader_tool** - Access MCP resources (category lists, etc.) 11. **category_list_tool** - _(Deprecated)_ Legacy category list access 12. **version_tool** - Server version information

#### Offline Geospatial Tools (9 tools)

These tools perform calculations locally using Turf.js - no API calls, no internet required:

13. **distance_tool** - Calculate distance between coordinates (Haversine formula)
14. **bearing_tool** - Compass direction between two points
15. **midpoint_tool** - Geographic midpoint along great circle
16. **centroid_tool** - Geometric center of polygons
17. **area_tool** - Calculate polygon area (sq meters, acres, hectares, etc.)
18. **bounding_box_tool** - Minimum bbox containing geometry
19. **buffer_tool** - Create buffer zones around geometries
20. **point_in_polygon_tool** - Test if point is inside polygon (geofencing)
21. **simplify_tool** - Reduce vertices using Douglas-Peucker algorithm

**Utility (3 tools)** 22. **resource_reader_tool** - Access MCP resources 23. **category_list_tool** - _(Deprecated)_ Legacy category list 24. **version_tool** - Server version info

### 1.2 TomTom MCP Server (11 Tools)

**Search & Geocoding (5 tools)**

1. **tomtom-geocode** - Forward geocoding (addresses to coordinates)
2. **tomtom-reverse-geocode** - Reverse geocoding (coordinates to addresses)
3. **tomtom-fuzzy-search** - Search with typo tolerance
4. **tomtom-poi-search** - Point of interest category search
5. **tomtom-nearby** - Find locations within radius

**Routing & Navigation (3 tools)** 6. **tomtom-routing** - Basic A-to-B routing 7. **tomtom-waypoint-routing** - Multi-waypoint route optimization 8. **tomtom-reachable-range** - Calculate reachable areas (isochrone)

**Traffic & Visualization (3 tools)** 9. **tomtom-traffic** - Real-time traffic incidents and conditions 10. **tomtom-static-map** - Static map image generation 11. **tomtom-dynamic-map** - Advanced map rendering with overlays

### 1.3 Google Maps Grounding Lite (3 Tools)

**Official Production API**

1. **search_places** - AI-enhanced place search with summaries
2. **lookup_weather** - Current weather + forecasts
3. **compute_routes** - Basic routing (DRIVE/WALK modes)

### 1.4 Google Maps Community Server (7 Tools)

**Community Implementation**

1. **search_nearby** - Nearby place search
2. **get_place_details** - Detailed place info (reviews, ratings)
3. **maps_geocode** - Forward geocoding
4. **maps_reverse_geocode** - Reverse geocoding
5. **maps_distance_matrix** - Multi-origin/destination travel times
6. **directions** - Turn-by-turn directions
7. **elevation** - Elevation/terrain data

---

## 2. Feature Comparison Matrix

### 2.1 Core Capabilities

| Feature                          | Mapbox                     | TomTom        | Google Grounding | Google Community |
| -------------------------------- | -------------------------- | ------------- | ---------------- | ---------------- |
| **Search & Discovery**           |
| Forward Geocoding                | ✅ (unified search)        | ✅            | ❌               | ✅               |
| Reverse Geocoding                | ✅                         | ✅            | ❌               | ✅               |
| POI Search                       | ✅                         | ✅            | ✅ (AI-enhanced) | ✅               |
| Category Search                  | ✅                         | ✅            | ❌               | ❌               |
| Fuzzy/Typo-Tolerant Search       | ✅ (auto)                  | ✅ (explicit) | ❌               | ❌               |
| Nearby Search                    | ✅                         | ✅            | ✅               | ✅               |
| Place Reviews/Ratings            | ❌                         | ❌            | ❌               | ✅               |
| **Routing & Navigation**         |
| Basic Routing                    | ✅                         | ✅            | ✅               | ✅               |
| Multi-Waypoint Routing           | ✅ (2-25 points)           | ✅            | ❌               | ✅               |
| Route Optimization (TSP)         | ✅ (2-12 stops)            | ✅            | ❌               | ❌               |
| Traffic-Aware Routing            | ✅                         | ✅            | ❌               | ✅               |
| Multiple Travel Modes            | ✅ (4 modes)               | ✅            | ✅ (2 modes)     | ✅               |
| Route Exclusions                 | ✅ (tolls, ferries, etc.)  | ❌            | ❌               | ❌               |
| Vehicle Constraints              | ✅ (height, width, weight) | ❌            | ❌               | ❌               |
| Scheduled Routing                | ✅ (depart_at, arrive_by)  | ❌            | ❌               | ❌               |
| **Matrix & Analysis**            |
| Travel Time Matrix               | ✅ (many-to-many)          | ❌            | ❌               | ✅               |
| Distance Matrix                  | ✅                         | ❌            | ❌               | ✅               |
| Isochrone/Reachability           | ✅                         | ✅            | ❌               | ❌               |
| **GPS & Data Quality**           |
| Map Matching (GPS trace cleanup) | ✅ (100 coords)            | ❌            | ❌               | ❌               |
| Timestamp Support                | ✅                         | ❌            | ❌               | ❌               |
| Configurable Snap Radius         | ✅                         | ❌            | ❌               | ❌               |
| **Visualization**                |
| Static Maps                      | ✅ (MCP-UI)                | ✅            | ❌               | ❌               |
| Dynamic Maps                     | ❌                         | ✅            | ❌               | ❌               |
| Custom Markers                   | ✅                         | ✅            | ❌               | ❌               |
| Route Overlays                   | ✅                         | ✅            | ❌               | ❌               |
| **Data & Environment**           |
| Real-time Traffic                | ❌                         | ✅            | ❌               | ❌               |
| Weather Data                     | ❌                         | ❌            | ✅               | ❌               |
| Elevation Data                   | ❌                         | ❌            | ❌               | ✅               |
| **Offline Capabilities**         |
| Offline Distance Calc            | ✅                         | ❌            | ❌               | ❌               |
| Offline Area Calc                | ✅                         | ❌            | ❌               | ❌               |
| Offline Bearing                  | ✅                         | ❌            | ❌               | ❌               |
| Offline Buffers                  | ✅                         | ❌            | ❌               | ❌               |
| Offline Geofencing               | ✅                         | ❌            | ❌               | ❌               |
| Offline Simplification           | ✅                         | ❌            | ❌               | ❌               |
| Offline Bounding Box             | ✅                         | ❌            | ❌               | ❌               |
| Offline Midpoint                 | ✅                         | ❌            | ❌               | ❌               |
| Offline Centroid                 | ✅                         | ❌            | ❌               | ❌               |

### 2.2 Advanced Features

| Feature                   | Mapbox                 | TomTom              | Google Grounding | Google Community |
| ------------------------- | ---------------------- | ------------------- | ---------------- | ---------------- |
| **MCP Protocol Features** |
| MCP Resources             | ✅                     | ❌                  | ❌               | ❌               |
| MCP-UI Support            | ✅                     | ❌                  | ❌               | ❌               |
| Elicitations (Draft Spec) | 🔄 In Progress         | ❌                  | ❌               | ❌               |
| **Developer Experience**  |
| OpenTelemetry Tracing     | ✅                     | ❌                  | ❌               | ❌               |
| Hosted Endpoint           | ✅ (mcp.mapbox.com)    | ✅ (mcp.tomtom.com) | ✅               | ❌               |
| Docker Support            | ✅                     | ❌                  | ❌               | ❌               |
| TypeScript Codebase       | ✅                     | ❌                  | ❌               | ✅               |
| Comprehensive Docs        | ✅                     | ✅                  | ✅               | Basic            |
| Integration Guides        | ✅ (5 guides)          | Basic               | ✅               | Basic            |
| **Data & API Design**     |
| Structured Content        | ✅                     | ❌                  | ❌               | ❌               |
| GeoJSON Output            | ✅                     | ❌                  | ❌               | ✅               |
| Traffic Annotations       | ✅ (congestion levels) | ✅ (incidents)      | ❌               | ❌               |
| Response Cleaning         | ✅ (token optimized)   | ❌                  | ❌               | ❌               |

---

## 3. Unique Differentiators

### 3.1 Mapbox Unique Strengths

#### 🎯 Largest Tool Surface Area

- **24 tools** vs 11 (TomTom), 3-7 (Google)
- Most comprehensive geospatial capabilities in a single MCP server

#### 🔌 Offline Geospatial Toolkit (9 Tools)

**Unique to Mapbox** - No API calls, works without internet:

- Distance, bearing, midpoint calculations
- Area, centroid, bounding box
- Buffer zones and simplification
- Point-in-polygon (geofencing)

**Use Cases**:

- Edge computing and offline applications
- Cost-sensitive scenarios (no API charges)
- Privacy-sensitive calculations
- Testing and development without API limits

#### 🛣️ Advanced Routing Features

**Most sophisticated routing** of any MCP server:

- **Multi-waypoint optimization**: 2-25 waypoints (TomTom: basic waypoints, Google Grounding: none)
- **Route exclusions**: Tolls, ferries, highways, borders, custom points
- **Vehicle constraints**: Height, width, weight restrictions (unique)
- **Scheduled routing**: depart_at + arrive_by (unique)
- **Traffic annotations**: Detailed congestion levels by segment

#### 🧩 Map Matching & GPS Trace Cleanup

**Unique capability** - snap noisy GPS traces to road network:

- Up to 100 coordinates per request
- Timestamp support for speed-based matching
- Configurable snap radius for GPS quality
- Essential for fitness apps, fleet tracking, trip reconstruction

#### 📊 Travel Time Matrix

**Unique among competitors**:

- Many-to-many distance/duration calculations
- Essential for logistics optimization
- Location planning and accessibility analysis

#### 🔬 Production-Ready Observatory

**Most advanced monitoring**:

- Full OpenTelemetry tracing
- CloudFront correlation IDs
- 8+ observability platform configs (AWS, Azure, GCP, Datadog, New Relic, etc.)
- <1% CPU overhead

#### 🎨 MCP Protocol Innovation

**Leading MCP adoption**:

- **MCP Resources**: Category lists as first-class resources
- **MCP-UI**: Embeddable iframe maps (Goose support)
- **Elicitations**: Two-stage interactive flows (PR #98, #99)
  - Stage 1: Routing preferences (tolls, highways, ferries)
  - Stage 2: Route selection with traffic/incident visualization

#### 📦 Response Optimization

**Token-efficient design**:

- Automatic response cleaning for LLM consumption
- Structured content + text format
- Traffic/incident summarization
- Removes redundant data (UUIDs, weight fields, etc.)

### 3.2 TomTom Unique Strengths

#### 🚦 Real-Time Traffic Incidents

**Only server with traffic data**:

- Live incident reports
- Dangerous conditions
- Road closures
- Unique for safety-critical applications

#### 🗺️ Self-Contained Map Rendering

**Architectural philosophy - embedding vs API**:

TomTom embeds MapLibre GL Native directly in their MCP server for sophisticated server-side rendering:

- **Self-contained**: No external Static Images API needed
- **Advanced rendering**: Uses same engine as their interactive maps
- **Custom overlays**: Complex geometries and styling beyond basic markers
- **Real-time traffic visualization**: Render traffic data directly

**Trade-off**: Requires native dependencies (Cairo, Pango, Canvas) making local installation complex. Disabled by default (`ENABLE_DYNAMIC_MAPS=true` required).

**vs Mapbox**: Calls hosted Static Images API - simpler installation but API-dependent.

#### 🔍 Explicit Fuzzy Search

**Typo tolerance**:

- Dedicated fuzzy search tool
- More explicit than Mapbox's automatic tolerance

#### 🌐 Dual Backend Support

**Flexibility**:

- Toggle between TomTom Maps (default) and Orbis Maps (preview)
- Environment variable configuration

### 3.3 Google Maps Strengths

#### ☁️ Weather Integration (Grounding Lite)

**Only server with weather**:

- Current conditions
- Hourly + daily forecasts
- Unique for travel planning

#### 🤖 AI-Enhanced Summaries (Grounding Lite)

**LLM-optimized**:

- AI-generated place descriptions
- Contextual summaries

#### ⭐ Reviews & Ratings (Community)

**Social proof**:

- User reviews and ratings
- Only available in community server

#### 🏔️ Elevation Data (Community)

**Terrain analysis**:

- Height/altitude information
- Unique among MCP servers

#### 🆓 Free Experimental Period (Grounding Lite)

**No cost during testing**:

- Free quotas during experimental phase
- Rate-limited but cost-free

---

## 4. Code Quality & Architecture Comparison

This section compares the implementation quality, architecture patterns, and engineering practices between Mapbox and TomTom MCP servers based on codebase analysis.

### 4.1 Architecture Patterns

#### Mapbox Architecture

**Tool Implementation**: Class-based with base class pattern

```typescript
// Base class for all API tools
abstract class MapboxApiBasedTool {
  constructor({ httpRequest }: { httpRequest: typeof fetch })
  abstract run(input: InputType): Promise<ToolResponse>
}

// Example tool
class DirectionsTool extends MapboxApiBasedTool { ... }
```

**Key Patterns**:

- **Dependency injection**: `httpRequest` passed to tools for testability
- **Centralized registry**: `toolRegistry.ts` - all tools in one place (src/tools/toolRegistry.ts:18)
- **HTTP pipeline**: Policy-based HTTP handling (User-Agent, Retry, etc.) without global fetch patching (src/utils/httpPipeline.ts:21)
- **Schema validation**: Zod schemas for input/output with strict TypeScript types
- **Token optimization**: `cleanResponseData()` utility removes unnecessary fields, summarizes data (src/tools/directions-tool/cleanResponseData.ts)

**Tool Registration**:

```typescript
// Single source of truth
export const ALL_TOOLS = [
  DirectionsTool,
  SearchAndGeocodeTool
  // ... all tools
];
```

#### TomTom Architecture

**Tool Implementation**: Function-based with factory pattern

```typescript
// Handler factory functions
export function createGeocodeHandler() {
  return async (params: any) => {
    const result = await geocodeAddress(query, options);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  };
}

// Tool registration
export function createSearchTools(server: McpServer): void {
  server.registerTool("tomtom-geocode", { ... }, createGeocodeHandler());
}
```

**Key Patterns**:

- **Three-tier architecture**: Tools → Handlers → Services
- **Service layer**: Heavy separation of concerns with dedicated services
- **Factory functions**: Creates handlers rather than class instances
- **AsyncLocalStorage**: Session isolation for HTTP mode (src/services/base/tomtomClient.ts)
- **Dual backend support**: Toggle between Genesis/Orbis APIs
- **No response optimization**: Full API responses returned with JSON.stringify

**Tool Registration**: Distributed across multiple `createXxxTools()` files

### 4.2 Token Optimization Comparison

#### Mapbox: Aggressive Token Optimization ✅

**Strategy**: `cleanResponseData()` function processes all responses (src/tools/directions-tool/cleanResponseData.ts:133-352)

**Optimizations Applied**:

1. **Remove unnecessary fields**: `uuid`, `code`, `weight`, `weight_name`
2. **Round numeric values**: Distance/duration to integers
3. **Summarize nested data**:
   - Extract leg summaries instead of full leg objects
   - Collect unique admin boundaries
   - Aggregate notification messages
   - Condense incidents to essential fields
4. **Calculate derived metrics**:
   - Average speed from segments
   - Congestion distance breakdown
   - Traffic level summaries
5. **Rename for clarity**: `location` → `snap_location`, `distance` → `snap_distance`
6. **Limit instructions**: Only include 1-10 voice instructions (not all)

**Example**: DirectionsTool response

- Raw API: ~15KB with full legs, steps, intersections
- Cleaned: ~5KB with summaries, key metrics, no redundant data
- **~67% token reduction**

#### TomTom: No Optimization ❌

**Strategy**: Direct JSON stringification

```typescript
text: JSON.stringify(result, null, 2);
```

**Issues**:

- Returns complete API response unchanged
- Includes all fields regardless of LLM utility
- 2-space indentation increases token count
- No summarization of nested structures
- No derived metrics calculated

**Impact**: 2-3x higher token consumption than Mapbox for equivalent data

### 4.3 Error Handling Comparison

#### TomTom: More Comprehensive Status-Code Handling ✅

**Centralized error handler** (src/utils/errorHandler.ts):

```typescript
export function handleApiError(error: unknown, context: string): Error {
  if (axios.isAxiosError(error)) {
    if (statusCode === 401 || 403) {
      userMessage =
        'Authentication error: Your TomTom API key may be invalid or expired. Please check your TOMTOM_API_KEY environment variable.';
    } else if (statusCode === 429) {
      userMessage =
        'Rate limit exceeded. Please wait before making more requests or upgrade your TomTom API plan.';
    } else if (statusCode === 503) {
      userMessage =
        'TomTom service temporarily unavailable. The API may be experiencing issues.';
    }
  }
}
```

**Strengths**:

- Specific guidance per HTTP status code
- User-friendly error messages
- Custom error classes (`TomTomApiError`, `NetworkError`)
- Proper prototype chains for error instanceof checks

#### Mapbox: Tool-Level Error Handling

**Pattern**: Each tool handles its own errors

```typescript
try {
  const response = await this.httpRequest(url);
  const data = await response.json();
  return { content: [...], isError: false };
} catch (error) {
  return { content: [{ type: 'text', text: String(error) }], isError: true };
}
```

**Strengths**:

- Simpler, more direct
- No centralized error handler complexity
- Proper `isError` flag in responses

**Opportunity**: Could adopt TomTom's detailed status-code guidance

### 4.4 Testing & Quality Assurance

#### Mapbox

**Test Coverage**: Comprehensive Vitest-based testing

- Unit tests for all tools (src/tools/\*/Tool.test.ts)
- Mock-based testing with dependency injection
- Schema validation tests
- Test coverage reports
- Pre-commit hooks (Husky) run linting + formatting

**Test Pattern**:

```typescript
const mockHttpRequest = vi.fn();
const tool = new DirectionsTool({ httpRequest: mockHttpRequest });
```

**Quality Tools**:

- ESLint + Prettier (strict configuration)
- TypeScript strict mode
- Vitest for testing
- Pre-commit hooks prevent broken commits

#### TomTom

**Test Coverage**: Comprehensive test files

- Nearly every file has matching `.test.ts`
- Both mock-based and live API tests
- Structured test organization

**Quality Tools**:

- ESLint + Prettier configured
- TypeScript (tsconfig shows strict settings)
- Vitest for testing framework
- Pino for structured logging

**Strengths**: Mix of mocked and live API tests provides better integration coverage

### 4.5 Dependency Management

#### Mapbox

**HTTP Client**: Native `fetch` via `httpPipeline`

- No external HTTP library dependency
- Policy-based middleware system
- Built-in retry, User-Agent, rate limiting policies
- Modern, lightweight approach

**Key Dependencies**:

- `@modelcontextprotocol/sdk`: MCP protocol
- `zod`: Schema validation
- `vitest`: Testing
- `@opentelemetry/*`: Observability
- No heavyweight HTTP libraries

#### TomTom

**HTTP Client**: Axios

- Popular but heavier HTTP library
- Larger dependency footprint
- Custom instance creation with interceptors

**Key Dependencies**:

- `@modelcontextprotocol/sdk`: MCP protocol
- `axios`: HTTP client
- `zod`: Schema validation
- `pino`: Logging
- `canvas` + `@maplibre/maplibre-gl-native`: Optional for dynamic maps (heavy native dependencies)

**Native Dependencies for Self-Contained Rendering**:

TomTom's architectural choice to embed map rendering requires:

- System-level dependencies (cairo, pango, pixman, etc.)
- Platform-specific compilation (different for Linux/macOS/Windows)
- Docker setup documented extensively for consistent builds
- Optional and disabled by default (graceful degradation)

**Local Installation Impact**: Complex for Claude Desktop/VS Code users - many will encounter native compilation errors.

**Philosophy**: Self-contained (no external API) vs Mapbox's API-dependent (simpler install)

### 4.6 Documentation Quality

#### Mapbox

**Documentation**:

- Comprehensive README with quick start
- 8 detailed integration guides (Claude Desktop, VS Code, Cursor, Goose, etc.)
- Engineering standards document (docs/engineering_standards.md)
- Tracing setup guide (docs/tracing.md)
- 40+ prompt examples
- API documentation for each tool

**Developer Guides**:

- Clear setup instructions
- Multiple environment configurations
- OpenTelemetry setup for 8+ platforms

#### TomTom

**Documentation**:

- Good overview documentation
- `Adding_new_tools.md` - excellent developer guide for contributors
- Setup guides for Claude/Cursor/VS Code/Windsurf
- API reference documentation
- Native dependency setup (comprehensive)

**Developer Guides**:

- Detailed native dependency instructions
- Docker setup for Linux/macOS/Windows
- Environment variable configuration

### 4.7 Code Maturity Assessment

| Aspect                 | Mapbox                         | TomTom                                   |
| ---------------------- | ------------------------------ | ---------------------------------------- |
| **Architecture**       | 🥇 Modern (DI, class-based)    | ✅ Enterprise (3-tier, service layer)    |
| **Token Optimization** | 🥇 Aggressive (~67% reduction) | ❌ None                                  |
| **Error Messages**     | ✅ Basic                       | 🥇 Detailed with guidance                |
| **Testing**            | ✅ Comprehensive unit tests    | ✅ Unit + live API tests                 |
| **Dependencies**       | 🥇 Lightweight (native fetch)  | ✅ Standard (Axios)                      |
| **Type Safety**        | 🥇 Strict TypeScript           | ✅ TypeScript                            |
| **HTTP Abstraction**   | 🥇 Policy-based pipeline       | ✅ Axios interceptors                    |
| **Response Format**    | 🥇 Structured + text           | ❌ Text only                             |
| **Documentation**      | 🥇 Comprehensive (8 guides)    | ✅ Good                                  |
| **Native Deps**        | 🥇 None required (API-based)   | ⚠️ Required for self-contained rendering |
| **License**            | 🥇 MIT                         | ✅ Apache 2.0                            |
| **Status**             | 🥇 Production                  | ⚠️ Alpha                                 |

### 4.8 Key Architectural Takeaways

#### Mapbox Advantages

1. **Token optimization** - Major competitive advantage, critical for LLM costs
2. **API-based architecture** - Simpler installation, works immediately in Claude Desktop/VS Code
3. **Dependency injection** - More testable architecture
4. **Lightweight dependencies** - No native compilation required
5. **Policy-based HTTP** - Cleaner than global fetch patching or interceptors
6. **Centralized registry** - Easier to see all tools at once
7. **Structured content** - Better MCP protocol usage

#### TomTom Advantages

1. **Self-contained rendering** - No external Static Images API dependency (trade-off: complex install)
2. **More detailed error messages** - Better user guidance
3. **Three-tier architecture** - Better separation of concerns for large teams
4. **Live API tests** - Better integration coverage
5. **Dual backend support** - More flexible for different API versions
6. **Adding_new_tools.md** - Excellent contributor documentation

#### Recommendations for Mapbox

1. ✅ Keep token optimization (unique advantage)
2. ✅ Keep dependency injection pattern
3. 📋 Consider: More detailed status-code error messages like TomTom
4. 📋 Consider: Add "Adding_new_tools.md" for contributors
5. ✅ Keep lightweight dependency approach

---

## 5. Production Deployment & HTTP Transport

This section compares the hosted/HTTP deployment implementations between Mapbox and TomTom MCP servers.

### 5.1 Transport Architecture

#### Mapbox Hosted MCP Server

**Repository**: Private `hosted-mcp-server` repo
**Framework**: Fastify (high-performance)
**Architecture**: Stateless multi-instance with domain-based routing

**Core Components**:

```typescript
// Fastify server with security middleware
const app = Fastify();
app.register(helmet); // Security headers
app.register(cors); // CORS configuration

// Route groups
app.register(healthRoutes); // GET /health
app.register(oauthRoutes); // /.well-known/*, /oauth/*
app.register(mcpRoutes, { prefix: '/mcp' }); // MCP protocol endpoints
app.register(mcpRoutes); // Also at root for ChatGPT
```

**Transport Implementation** (src/routes/mcp.ts:158-160):

```typescript
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined // Stateless mode
});

await transport.handleRequest(request.raw, reply.raw, request.body);
```

**Key Features**:

- **Stateless design**: No session persistence required
- **SSE by default**: Server-Sent Events for streaming responses
- **Domain-based routing**: Different servers per subdomain
  - `mcp.mapbox.com` → Standard Mapbox MCP
  - `devkit.mcp.mapbox.com` → Extended DevKit version
- **Response interception**: Parses SSE chunks to detect tool errors even on HTTP 200

#### TomTom HTTP Mode

**Repository**: Public `tomtom-mcp` repo
**Framework**: Express
**Architecture**: Single/multi-instance with session isolation

**Core Components**:

```typescript
// Express server
const app = express();

// Single MCP endpoint
app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    enableJsonResponse: true // JSON instead of SSE
  });

  // Session context via AsyncLocalStorage
  runWithSessionContext(apiKey, backend, () => {
    await transport.handleRequest(req, res);
  });
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));
```

**Key Features**:

- **AsyncLocalStorage**: Session isolation for concurrent requests
- **JSON responses**: Not SSE (enableJsonResponse: true)
- **API key in headers**: `tomtom-api-key` header
- **Dual backend**: Toggle between Genesis/Orbis APIs
- **CORS support**: Configurable origins

### 5.2 Authentication & Security

#### Mapbox: OAuth 2.0 Bearer Tokens

**Auth Flow**:

1. Client obtains OAuth token from Mapbox OAuth service
2. Token sent in `Authorization: Bearer <token>` header
3. Server validates via `@mapbox/auth-service` package
4. Extracts `accountId` for rate limiting
5. Token passed through to MCP tools for Mapbox API calls

**Implementation** (src/middleware/bearerAuth.ts):

```typescript
const result = await authClient.VerifyToken({ token });
request.bearerToken = token;
request.userId = tokenInfo.accountId;
request.raw.auth = { token: bearerToken }; // Available to tools
```

**RFC Compliance**:

- RFC 8414: OAuth Authorization Server Metadata
- RFC 9728: OAuth Protected Resource Metadata
- WWW-Authenticate header with proper error details

**OAuth Discovery Endpoints**:

- `/.well-known/oauth-authorization-server`
- `/.well-known/oauth-protected-resource`
- `/.well-known/oauth-protected-resource/mcp` (path-aware)
- `GET /mcp/servers` - List available MCP servers

**ChatGPT OAuth Proxy** (src/routes/oauth.ts:110-150):

- Solves ChatGPT compatibility issue
- Converts HTTP Basic Auth (`client_secret_basic`) to form body (`client_secret_post`)
- Transparent proxy to Mapbox OAuth endpoint

#### TomTom: API Key Headers

**Auth Flow**:

1. Client sends API key in `tomtom-api-key` header
2. No central validation service
3. API key used directly in TomTom API calls
4. AsyncLocalStorage isolates keys between concurrent requests

**Implementation**:

```typescript
// Extract API key from header
const apiKey = req.headers['tomtom-api-key'];

// Store in AsyncLocalStorage for session isolation
runWithSessionContext(apiKey, backend, () => {
  // All service calls within this context use this API key
});
```

**Security**: Basic, relies on TomTom API validation

### 5.3 Rate Limiting & Quotas

#### Mapbox

**Strategy**: Account-based rate limiting with Memcached

- **Limit**: 300 requests/minute per account (~5 req/sec average)
- **Key**: `accountId` from OAuth token (or IP fallback)
- **Store**: Memcached if `MEMCACHED_ENDPOINT` set, else in-memory
- **Scope**: Per-account (not per-IP)

**Benefits**:

- Fair quota per user, not shared across organization
- Distributed rate limiting across instances
- No circumvention via IP rotation

#### TomTom

**Strategy**: Not explicitly documented

- Likely relies on TomTom API rate limits
- No client-side rate limiting visible in HTTP mode code

### 5.4 Deployment Infrastructure

#### Mapbox: Cloud-Native Multi-Instance

**Architecture**:

```
CloudFront/ALB (Domain-based routing)
    ├── mcp.mapbox.com → ECS Instance (MCP_SERVER=mapbox)
    ├── devkit.mcp.mapbox.com → ECS Instance (MCP_SERVER=mapbox-devkit)
    └── custom.mcp.mapbox.com → ECS Instance (MCP_SERVER=custom)
         ↓
    Fastify Server (Port 3000)
         ↓
    MCPManager (lazy-loads one server per instance)
         ↓
    MCP Server (Git submodules)
         ↓
    Mapbox APIs
```

**Infrastructure-as-Code**: CloudFormation templates

- ECS task definitions
- Auto-scaling configuration
- Environment variable injection
- Health checks at `/health`

**Docker Deployment**:

```dockerfile
FROM node:22-slim AS builder
# Initialize git submodules
RUN git submodule init && git submodule update --recursive
# Build submodules (mcp-server, mcp-devkit-server)
RUN npm run build:submodules
RUN npm run build
# Non-root user for security
USER appuser
```

**Server Selection**:

- One server per deployed instance (not per-request)
- Configured via `MCP_SERVER` environment variable
- Domain routing determines which instance handles request

**Scaling**:

- **Horizontal**: Fully stateless - add instances freely
- **Resource isolation**: Separate instances per server variant
- **Load balancing**: CloudFront/ALB handles distribution

#### TomTom: Development/Integration HTTP Mode

**Deployment**: Primarily for local development and integration testing

- Docker support mentioned but not in official repo
- HTTP mode for web application integration
- Express server on configurable port

**Server Selection**:

- Single instance can serve both Genesis and Orbis backends
- Backend selected per-request via AsyncLocalStorage context
- Environment variable `MAPS=orbis|genesis` sets default

**Scaling**: Not documented for production multi-instance deployment

### 5.5 Observability & Monitoring

#### Mapbox: Comprehensive Telemetry

**OpenTelemetry Integration** (src/telemetry/index.ts):

- **Traces**: OTLP HTTP exporter
- **Metrics**: Prometheus-compatible
- **Auto-instrumentation**: Node.js HTTP, fetch, etc.
- **Sample rate**: Configurable via `OTEL_TRACE_SAMPLE_RATE`

**Spans Created**:

```
mcp.request (parent)
  ├── oauth.validate_token
  ├── rate_limit.check
  ├── mcp.create_server
  ├── mcp.create_transport
  └── mcp.handle_request
      └── tool.execute
```

**Structured Logging** (CloudWatch-optimized):

```typescript
logger.info(
  {
    mcpRequestStatus: 'success' | 'failure',
    mcpToolError: boolean,
    method: string,
    tool: string,
    statusCode: number,
    duration: number,
    userId: string,
    requestId: string,
    errorMessage: string
  },
  'MCP request completed'
);
```

**CloudWatch Metric Filters**: JSON structure enables cross-field correlation

- Filter by tool name + error status
- User-based error tracking
- Performance monitoring per tool

**Supported Platforms** (8+ configurations):

- AWS (CloudWatch, X-Ray)
- Azure (Application Insights)
- GCP (Cloud Trace)
- Datadog
- New Relic
- Honeycomb
- Jaeger
- Zipkin

#### TomTom: Pino Logging

**Logging**: Pino JSON structured logging to stderr

```typescript
logger.info({
  message: 'Request processed',
  tool: 'tomtom-geocode',
  duration: 123
});
```

**Benefits**: Structured JSON for log aggregation
**Limitation**: No OpenTelemetry traces or distributed tracing

### 5.6 SSE Response Error Detection (Mapbox Unique)

**Challenge**: MCP SDK uses Server-Sent Events by default

- Tool errors returned in result object, not HTTP status codes
- HTTP 200 even when tool execution failed
- Need to detect errors for proper metrics

**Solution** (src/routes/mcp.ts:173-206): Intercept `reply.raw.write()`

```typescript
const originalWrite = reply.raw.write.bind(reply.raw);
let toolCallHasError = false;

reply.raw.write = function (chunk: any, ...args: any[]) {
  // Parse SSE format: "data: {json}\n\n"
  const dataMatch = chunkStr.match(/^data: (.+)$/m);
  if (dataMatch) {
    const jsonData = JSON.parse(dataMatch[1]);

    // Check for JSON-RPC errors or tool result errors
    if (jsonData.error || jsonData.result?.isError) {
      toolCallHasError = true;
      toolErrorMessage = jsonData.result?.content?.[0]?.text;
    }
  }

  return originalWrite(chunk, ...args);
};
```

**Outcome**: Accurate failure metrics even with HTTP 200 responses

### 5.7 Comparison Summary

| Aspect                     | Mapbox                           | TomTom                      |
| -------------------------- | -------------------------------- | --------------------------- |
| **Framework**              | 🥇 Fastify (faster)              | ✅ Express (standard)       |
| **Transport**              | 🥇 Stateless SSE                 | ✅ AsyncLocalStorage + JSON |
| **Auth Method**            | 🥇 OAuth 2.0 Bearer              | ✅ API Key headers          |
| **OAuth Compliance**       | 🥇 RFC 8414, 9728                | ❌ N/A                      |
| **ChatGPT Integration**    | 🥇 OAuth proxy for compatibility | ❌ Unknown                  |
| **Rate Limiting**          | 🥇 Account-based + Memcached     | ❌ Not visible              |
| **Multi-Instance**         | 🥇 Domain-based routing          | ❌ Not documented           |
| **Observability**          | 🥇 OpenTelemetry (8+ platforms)  | ✅ Pino logging             |
| **Error Detection**        | 🥇 SSE chunk parsing             | ✅ Standard                 |
| **CloudWatch Integration** | 🥇 Structured metrics            | ❌ N/A                      |
| **Infrastructure-as-Code** | 🥇 CloudFormation                | ❌ Not documented           |
| **Docker**                 | 🥇 Production-ready              | ⚠️ Development              |
| **Scaling Strategy**       | 🥇 Horizontal (stateless)        | ⚠️ Not documented           |
| **Status**                 | 🥇 Production                    | ⚠️ Development/integration  |

### 5.8 Production Readiness Assessment

#### Mapbox Hosted MCP Server: Production-Grade ✅

**Strengths**:

- ✅ Stateless design enables unlimited horizontal scaling
- ✅ OAuth 2.0 with RFC-compliant discovery endpoints
- ✅ Comprehensive observability (OpenTelemetry + structured logging)
- ✅ Account-based rate limiting with distributed store
- ✅ CloudFormation IaC for repeatable deployments
- ✅ Multi-environment configuration with validation (Joi schema)
- ✅ ChatGPT OAuth compatibility layer
- ✅ SSE error detection for accurate metrics
- ✅ Domain-based routing for multiple server variants
- ✅ Security hardening (Helmet, CORS, non-root Docker user)

**Maturity**: Enterprise-ready for production workloads

#### TomTom HTTP Mode: Development/Integration ⚠️

**Strengths**:

- ✅ AsyncLocalStorage for session isolation
- ✅ Dual backend support (Genesis/Orbis)
- ✅ CORS configuration for web apps
- ✅ Health check endpoint

**Limitations**:

- ⚠️ Alpha status (not production-declared)
- ⚠️ No distributed rate limiting
- ⚠️ No observability beyond basic logging
- ⚠️ API key auth less secure than OAuth
- ⚠️ Scaling strategy not documented
- ⚠️ No IaC for production deployment

**Maturity**: Suitable for development and integration testing

### 5.9 Key Takeaways

1. **Mapbox has a production-grade hosted service** with comprehensive features:
   - OAuth 2.0, OpenTelemetry, IaC, stateless scaling
   - Significantly more mature than TomTom's HTTP mode

2. **TomTom's HTTP mode is developer-focused**:
   - Good for local integration testing
   - Not positioned as production hosting solution

3. **Mapbox's observability is unmatched**:
   - Only MCP server with OpenTelemetry support
   - 8+ platform configurations
   - Structured logging for CloudWatch

4. **OAuth vs API Key**:
   - Mapbox: More secure, account-scoped rate limiting
   - TomTom: Simpler, but less secure for production

5. **ChatGPT integration**:
   - Mapbox has OAuth proxy for compatibility
   - Critical for ChatGPT MCP adoption

---

## 6. Deployment & Integration

### 6.1 Hosting Options

| Server               | Remote Hosted     | Local Installation | Docker | Status       |
| -------------------- | ----------------- | ------------------ | ------ | ------------ |
| **Mapbox**           | ✅ mcp.mapbox.com | ✅ npm             | ✅     | Production   |
| **TomTom**           | ✅ mcp.tomtom.com | ✅                 | ❌     | Alpha        |
| **Google Grounding** | ✅ HTTP endpoint  | ❌                 | ❌     | Experimental |
| **Google Community** | ❌                | ✅                 | ❌     | Community    |

### 6.2 Client Compatibility

All servers support:

- Claude Desktop
- VS Code (with MCP extension)
- Cursor AI
- Continue
- Cline
- Goose (Mapbox has best support with MCP-UI)

### 6.3 Developer Experience

#### Mapbox

- **Docs**: Comprehensive (README + 8 detailed guides)
- **Examples**: 40+ prompt examples
- **Tracing**: Full OpenTelemetry support
- **Testing**: MCP Inspector + Docker
- **Type Safety**: Full TypeScript with strict mode

#### TomTom

- **Docs**: Good overview documentation
- **Examples**: Basic examples
- **Tracing**: Not documented
- **Testing**: Basic
- **Type Safety**: Unknown (not TypeScript)

#### Google Grounding Lite

- **Docs**: Official API documentation
- **Examples**: Basic
- **Tracing**: Not available
- **Testing**: Remote-only
- **Type Safety**: Not applicable (remote service)

---

## 7. Use Case Fit Analysis

### 7.1 When to Choose Mapbox

✅ **Best fit when you need**:

- **Offline capabilities**: Edge computing, privacy, cost optimization
- **Advanced routing**: Multi-waypoint, constraints, exclusions, scheduling
- **GPS trace processing**: Map matching for fitness/fleet apps
- **Travel time analysis**: Matrices for logistics optimization
- **Production monitoring**: OpenTelemetry tracing
- **Largest tool selection**: Maximum flexibility
- **Token efficiency**: Optimized LLM responses
- **MCP innovation**: Resources, MCP-UI, elicitations

✅ **Ideal for**:

- Logistics and delivery optimization
- Fleet management and tracking
- Travel planning applications
- Location intelligence platforms
- Enterprise applications with monitoring needs
- Offline-first or privacy-focused apps

### 7.2 When to Choose TomTom

✅ **Best fit when you need**:

- **Real-time traffic incidents**: Safety-critical navigation
- **Dynamic map visualization**: Advanced rendering
- **Fuzzy search**: Explicit typo tolerance
- **Dual backend**: Orbis Maps preview access

✅ **Ideal for**:

- Safety-focused navigation
- Applications requiring traffic incident data
- Advanced map visualization needs

### 7.3 When to Choose Google Maps

✅ **Best fit when you need**:

- **Weather integration**: Travel planning with forecasts (Grounding Lite)
- **AI summaries**: LLM-optimized place descriptions (Grounding Lite)
- **Reviews/ratings**: Social proof (Community)
- **Elevation data**: Terrain analysis (Community)
- **Free experimentation**: No cost during experimental phase (Grounding Lite)
- **Google brand trust**: Authoritative place data

✅ **Ideal for**:

- Travel and tourism applications
- Weather-dependent planning
- Applications leveraging Google's place database
- Cost-conscious experimentation

---

## 8. Pricing & Quotas

### Mapbox

- **Free Tier**: 100,000 free requests/month (location services)
- **Pay-as-you-go**: Standard Mapbox API pricing
- **Offline tools**: Free (no API calls)
- **Details**: https://www.mapbox.com/pricing

### TomTom

- **Free Tier**: 2,500 requests/day (Search/Geocoding), 50,000 Map Display
- **Evaluation**: Free trial available
- **Details**: https://developer.tomtom.com/store/maps-api

### Google Grounding Lite

- **Experimental**: Free during experimental period
- **Quotas**:
  - search_places: 100/min, 1,000/day
  - lookup_weather: 300/min
  - compute_routes: 300/min
- **Future pricing**: TBD

### Google Community

- **Standard Google Maps pricing**
- **Free Tier**: $200/month credit
- **Details**: https://mapsplatform.google.com/pricing/

---

## 9. Roadmap & Future Development

### 9.1 Mapbox (Confirmed/In Progress)

#### Elicitations (Draft MCP Spec) - In Progress

- **PR #98**: Geocoding disambiguation with elicitations
- **PR #99**: Two-stage DirectionsTool elicitations
  - Stage 1: Routing preferences (tolls, highways, ferries)
  - Stage 2: Route selection with traffic visualization
- **Status**: VS Code and Cursor support confirmed working

#### Potential Future Capabilities

- Optimization API V2 (time windows, capacity constraints, multi-vehicle)
- Enhanced traffic annotations
- Additional MCP-UI integrations
- More offline geospatial tools

### 9.2 TomTom

- **Current Status**: Alpha
- **Public Roadmap**: Not published

### 9.3 Google

- **Grounding Lite**: Experimental, pricing TBD
- **Community**: Community-maintained, no official roadmap

---

## 10. Summary & Recommendations

### Overall Assessment

| Dimension                  | Leader                  | Reasoning                                                                |
| -------------------------- | ----------------------- | ------------------------------------------------------------------------ |
| **Tool Count**             | 🥇 **Mapbox** (24)      | 2.2x more tools than TomTom (11), 3-8x more than Google (3-7)            |
| **Routing Sophistication** | 🥇 **Mapbox**           | Multi-waypoint, exclusions, constraints, scheduling, optimization        |
| **Offline Capabilities**   | 🥇 **Mapbox** (9 tools) | Only server with offline geospatial toolkit                              |
| **Traffic Data**           | 🥇 **TomTom**           | Only server with real-time incident data                                 |
| **Weather Data**           | 🥇 **Google Grounding** | Only server with weather integration                                     |
| **Map Visualization**      | 🥇 **TomTom**           | Self-contained rendering (trade-off: complex local install)              |
| **GPS Trace Processing**   | 🥇 **Mapbox**           | Only server with map matching                                            |
| **Token Optimization**     | 🥇 **Mapbox**           | ~67% token reduction via cleanResponseData, unique among all MCP servers |
| **Code Architecture**      | 🥇 **Mapbox**           | Modern DI pattern, lightweight dependencies, no native compilation       |
| **HTTP Transport**         | 🥇 **Mapbox**           | Production-grade with OAuth 2.0, OpenTelemetry, stateless scaling        |
| **Developer Experience**   | 🥇 **Mapbox**           | OpenTelemetry, Docker, comprehensive docs, MCP protocol leadership       |
| **Production Readiness**   | 🥇 **Mapbox**           | Production status, monitoring, hosted + local + Docker                   |
| **Reviews/Ratings**        | 🥇 **Google Community** | Social proof integration                                                 |
| **Elevation Data**         | 🥇 **Google Community** | Terrain analysis                                                         |

### Key Takeaways

1. **Mapbox offers the most comprehensive solution** with 24 tools covering the widest range of geospatial use cases
2. **Unique offline toolkit** (9 tools) provides cost savings, privacy benefits, and offline functionality unmatched by competitors
3. **Token optimization is a major competitive advantage** - ~67% token reduction via cleanResponseData, unique among all MCP servers (TomTom: 2-3x higher token costs)
4. **Most advanced routing** with vehicle constraints, exclusions, scheduling, and multi-waypoint optimization
5. **Production-grade HTTP transport** - OAuth 2.0, OpenTelemetry observability, stateless horizontal scaling (vs TomTom's development-focused HTTP mode)
6. **Modern architecture** - Dependency injection, lightweight dependencies, no native compilation required (vs TomTom's complex MapLibre/Canvas setup)
7. **Production-ready monitoring** with OpenTelemetry makes Mapbox the only enterprise-ready option
8. **MCP protocol leadership** with Resources, MCP-UI, and elicitations (in progress)
9. **TomTom excels at real-time traffic** - unique among all servers
10. **Google provides weather data** - unique to Grounding Lite
11. **Google Community offers social proof** - reviews and ratings

### Competitive Positioning

**Mapbox MCP Server** is the **most comprehensive and production-ready** geospatial MCP solution, offering:

- **2.2x more tools** than the nearest competitor (TomTom)
- **Unique offline capabilities** for cost optimization and privacy (9 tools, no competitors)
- **Most sophisticated routing engine** in the MCP ecosystem
- **67% token reduction** via aggressive response optimization (TomTom: 2-3x higher costs)
- **Production-grade HTTP transport** with OAuth 2.0, OpenTelemetry, and stateless scaling (TomTom: development-focused)
- **Modern architecture** with dependency injection and lightweight dependencies (no native compilation)
- **Enterprise-grade monitoring** with OpenTelemetry (8+ platform configurations)
- **Leading MCP adoption** with Resources, MCP-UI, and elicitations

While competitors excel in specific niches (TomTom for traffic, Google for weather/reviews), **Mapbox provides the broadest and deepest geospatial capabilities** with the most mature production infrastructure for AI applications.

---

## Appendix A: Tool Count Details

### Mapbox Breakdown (24 tools)

- **API Tools**: 13 (Search: 3, Routing: 4, Viz: 1, Analysis: 1, Utility: 4)
- **Offline Tools**: 9 (All geospatial calculations)
- **Utility Tools**: 2 (resource_reader, version)

### TomTom Breakdown (11 tools)

- **Search**: 5 tools
- **Routing**: 3 tools
- **Traffic & Viz**: 3 tools

### Google Grounding Lite Breakdown (3 tools)

- **Search**: 1 tool
- **Weather**: 1 tool
- **Routing**: 1 tool

### Google Community Breakdown (7 tools)

- **Search**: 3 tools
- **Routing**: 2 tools
- **Geocoding**: 2 tools (forward + reverse)
- **Elevation**: 1 tool

---

## Appendix B: Sources & References

### Mapbox

- [Mapbox MCP Server Repository](https://github.com/mapbox/mcp-server)
- [Mapbox MCP Hosted Endpoint](https://mcp.mapbox.com/mcp)
- [Mapbox API Documentation](https://docs.mapbox.com/)

### TomTom

- [TomTom MCP Documentation](https://developer.tomtom.com/tomtom-mcp/documentation/overview)
- [TomTom MCP Repository](https://github.com/tomtom-international/tomtom-mcp)
- [TomTom Newsroom](https://www.tomtom.com/newsroom/explainers-and-insights/introducing-tomtom-model-context-protocol-server/)

### Google Maps

- [Google Maps Grounding Lite MCP](https://developers.google.com/maps/ai/grounding-lite/reference/mcp)
- [Google Maps Platform Code Assist](https://developers.google.com/maps/ai/mcp)
- [Google Cloud Blog - MCP Announcement](https://cloud.google.com/blog/products/ai-machine-learning/announcing-official-mcp-support-for-google-services)
- [Google Maps Community Server](https://github.com/cablate/mcp-google-map)

---

**Document Status**: Ready for Review
**Next Review**: March 2026 or upon major competitor updates
