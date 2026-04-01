## Unreleased

## 0.11.0 - 2026-04-01

### Security

- **static_map_image_tool**: Validate `style` parameter against `username/style-id` format to prevent path traversal attacks where a crafted style value (e.g., `../../tokens/v2`) could escape the `/styles/v1/` URL path and access arbitrary Mapbox API endpoints using the server operator's token
- **static_map_image_tool**: Remove access token from URL returned in text content — the token is only used internally for the HTTP fetch and the MCP Apps iframe URL, not exposed to the model context

### New Features

- **9 new offline Turf.js geometry tools** (no API key required, instant results):
  - **`points_within_polygon_tool`**: Batch-test multiple points against a polygon in one call — replaces N `point_in_polygon_tool` calls for delivery zone validation, fleet geofencing, etc.
  - **`union_tool`**: Merge two or more polygons into a single unified geometry; useful for combining service areas, isochrones, or delivery zones
  - **`nearest_point_tool`**: Find the nearest point in a collection to a target — replaces calling `distance_tool` for each candidate
  - **`intersect_tool`**: Find the intersection geometry of two polygons (area they share in common)
  - **`difference_tool`**: Subtract one polygon from another ("what is in zone A but not zone B?")
  - **`destination_tool`**: Calculate a destination point given origin, bearing, and distance
  - **`length_tool`**: Measure the total length of a line/route without a routing API call
  - **`nearest_point_on_line_tool`**: Snap a point to the nearest position on a line or route
  - **`convex_tool`**: Compute the convex hull of a set of points

### Exports

- Added `getAllTools` to `@mapbox/mcp-server/tools` subpath export for batch access to all registered tools
- Added `getVersionInfo` and `VersionInfo` type to `@mapbox/mcp-server/utils` subpath export

### Removed

- **version_tool**: Removed from the tool list — version info is now available as a resource at `mapbox://version` with zero token overhead

### New Features

- **mapbox://version resource**: Server version, git SHA, tag, and branch accessible via `readResource('mapbox://version')`

### Bug Fixes

- **static_map_image_tool**: Large images (>700KB raw) are now stored as temporary resources instead of being inlined as base64, preventing the 1MB tool result limit from being exceeded in Claude Desktop
  - Image stored at `mapbox://temp/static-map-{id}`, retrievable via `resources/read` with a 30-minute TTL
  - `TemporaryResourceManager` now enforces a 50MB byte cap with oldest-first eviction to prevent unbounded memory growth
  - `TemporaryDataResource` now serves image mime types as blob content

## 0.10.0 - 2026-03-04

### New Features

- **IsochroneTool large-response handling**: Isochrone responses exceeding 50KB are now stored as temporary resources, consistent with DirectionsTool (#131)
  - Returns a compact summary with contour count and resource URI instead of the full GeoJSON
  - Full GeoJSON retrievable via `readResource('mapbox://temp/isochrone-{id}')` with 30-minute TTL
  - Normal-sized responses are unaffected

### Bug Fixes

- **static_map_image_tool**: Return a proper error when the Mapbox Static Images API returns a non-2xx response instead of silently encoding the error JSON as a fake base64 image (#130)
- **BaseResource URI template registration**: Fixed `TemporaryDataResource` (and any resource with `{` in its URI) never matching `readResource` calls (#133)
  - `server.registerResource()` with a plain string registers an exact-match static resource; template URIs like `mapbox://temp/{id}` require a `ResourceTemplate` object
  - `BaseResource.installTo()` now detects `{` in the URI and wraps it with `ResourceTemplate` automatically

### Dependencies

- Upgrade `@mcp-ui/server` from `^5.13.1` to `^6.1.0` (security advisory on older versions)
- Upgrade `@modelcontextprotocol/sdk` from `^1.26.0` to `^1.27.1` (security advisory on older versions); regenerated output-validation patch for new version

### Documentation

- Updated README: Goose added to MCP Apps supported clients; MCP-UI noted as legacy protocol

## 0.9.0 - 2026-02-24

### New Features

- **place_details_tool**: New tool to retrieve detailed information about a specific place by Mapbox ID
  - Accepts a `mapbox_id` from search results (`search_and_geocode_tool`, `category_search_tool`, `reverse_geocode_tool`)
  - Optional `attribute_sets` parameter: `basic`, `photos`, `visit` (hours, rating, price), `venue` (phone, website, social media)
  - Optional `language` and `worldview` parameters
  - Returns formatted text summary plus structured GeoJSON Feature content
  - Opening hours formatted as readable per-day text (e.g. "Monday: 9 AM – 9 PM") rather than raw JSON

- **Large Response Handling**: DirectionsTool now creates temporary resources for responses >50KB
  - Prevents context window overflow on long-distance routes
  - Returns summary with distance, duration, and resource URI
  - Full route geometry available via MCP resource API
  - Temporary resources expire after 30 minutes
  - Resource URI format: `mapbox://temp/directions-{id}`
  - Updated tool description to guide LLMs: use geometries="none" for planning, geometries="geojson" only for visualization
  - Returns lightweight structured content for large responses (summary data without geometry) to satisfy output schema validation
  - Updated `search-along-route` prompt to use `geometries="none"` and linear interpolation for route sampling instead of extracting coordinates from geometry

### Bug Fixes

- **search_and_geocode_tool**, **category_search_tool**: Include `mapbox_id` in formatted text output so models can chain directly to `place_details_tool` without re-fetching results as JSON
- **category_search_tool**: Fix schema validation failures on Japanese and other international place data
  - Added `.passthrough()` to all context sub-schemas to allow extra fields returned by the API
  - Made `country_code`, `country_code_alpha_3`, `region_code`, and `region_code_full` optional to match real API responses
  - Fixed `BaseTool` to pass the full Zod schema (not just `.shape`) to the MCP SDK so `.passthrough()` settings are preserved during structured-content validation

### Registry

- Added hosted MCP endpoint (`https://mcp.mapbox.com/mcp`) to `server.json` `remotes` for registry discoverability

### Dependencies

- Upgrade `@modelcontextprotocol/ext-apps` from `^1.1.0` to `^1.1.1`
- Upgrade `@modelcontextprotocol/sdk` from 1.25.3 to 1.26.0
- Regenerated SDK patch for version 1.26.0

### Documentation

- **PR Guidelines**: Added CHANGELOG requirement to CLAUDE.md (#112)
  - All pull requests must now update CHANGELOG.md
  - Document what changed, why, and any breaking changes
  - Add entry under "Unreleased" section with PR number

### Developer Experience

- **Release Process**: Added automated CHANGELOG preparation script (#112)
  - New `npm run changelog:prepare-release <version>` command
  - Automatically replaces "Unreleased" with version and date
  - Adds new empty "Unreleased" section for next changes
  - Includes validation for version format and CHANGELOG structure

## 0.8.3

### Features Added

- **MCP Apps Support for StaticMapImageTool** (#109)
  - Added interactive map preview in compatible MCP clients (VS Code, Claude Code, Goose)
  - Implemented `StaticMapUIResource` serving interactive HTML with inline MCP Apps SDK
  - Added `@modelcontextprotocol/ext-apps@^1.0.1` dependency
  - Enhanced `BaseTool` with `meta` property for MCP Apps metadata
  - Configured CSP for `api.mapbox.com` domains
  - Sends `ui/notifications/size-changed` to fit panel to rendered image height
  - Fullscreen toggle using `ui/request-display-mode`
  - Uses proper `RESOURCE_MIME_TYPE` ("text/html;profile=mcp-app") per MCP Apps specification
  - Tool response now includes: URL text (first, for MCP Apps), base64 image (for non-MCP-Apps clients), and optional UIResource (when MCP-UI enabled)

### Security

- **CVE-2026-0621**: Updated `@modelcontextprotocol/sdk` to 1.25.3 to fix ReDoS vulnerability in UriTemplate regex patterns
- Regenerated SDK patch for version 1.25.3

### Dependencies

- Added `@modelcontextprotocol/ext-apps@^1.0.1`
- Updated `@modelcontextprotocol/sdk` from 1.17.5 to 1.25.3

## 0.8.2

### Bug Fixes

- **StaticMapImageTool**: Added text content to response for better MCP client compatibility (#103)
  - Tool now returns structured content array with text description, image, and optional MCP-UI resource
  - Text content includes map metadata (center, zoom, size, style, overlay count)
  - Follows MCP specification for tool results with multiple content items

## 0.8.0

### Bug Fixes

- Removed an invalid option in input schema of `search_and_geocode_tool`. The `navigation_profile` used to have invalid `driving-traffic` option.

## 0.7.0

### Features Added

- **MCP Resources Support**: Added native MCP resource API support
  - Introduced `CategoryListResource` exposing category lists as `mapbox://categories` resource
  - Supports localized category lists via URI pattern `mapbox://categories/{language}` (e.g., `mapbox://categories/ja` for Japanese)
  - Created base resource infrastructure (`BaseResource`, `MapboxApiBasedResource`) for future resource implementations
  - Added `ResourceReaderTool` as fallback for clients without native resource support
  - Enables more efficient access to static reference data without tool calls

- **MCP-UI Support**: Added rich UI embedding for compatible MCP clients
  - `StaticMapImageTool` now returns both image data and an embeddable iframe URL
  - Enables inline map visualization in compatible clients (e.g., Goose)
  - Fully backwards compatible - clients without MCP-UI support continue working unchanged
  - Enabled by default, can be disabled via `ENABLE_MCP_UI=false` env var or `--disable-mcp-ui` flag
  - Added `@mcp-ui/server@^5.13.1` dependency
  - Configuration helper functions in `toolConfig.ts`

### Deprecations

- **CategoryListTool**: Marked as deprecated in favor of the new `mapbox://categories` resource
  - Tool remains functional for backward compatibility
  - Users are encouraged to migrate to either the native resource API or `resource_reader_tool`

## 0.6.1

### Other

- Update to MCP registry schema version 2025-10-17

## 0.6.0 (Unreleased)

### Features Added

- Support for `structuredContent` for all applicable tools
- Registers output schemas with the MCP server and validates schemas
- Adds OpenTelemetry Instrumentation for all HTTP calls

### Bug Fixes

- Fixed the version tool to properly emit the git version and branch

### Other Features

- Refactored `fetchClient` to be generic `httpRequest`.

## 0.5.5

- Add server.json for MCP registry

## 0.5.0

- Introduce new tool: SearchAndGeocodeTool
- Remove former tools: ForwardGeocodeTool, PoiSearchTool; their
  capabilities are combined in the new tool

## 0.4.1

- Minor changes to tool descriptions for clarity

## 0.4.0 (Unreleased)

### Features Added

- New fetch pipeline with automatic retry behavior

### Bug Fixes

- Dual emits ESM and CommonJS bundles with types per target

### Other Features

- Migrated from Jest to vitest

## v0.2.0 (2025-06-25)

- **Format Options**: Add `format` parameter to all geocoding and search tools
  - CategorySearchTool, ForwardGeocodeTool, PoiSearchTool, and ReverseGeocodeTool now support both `json_string` and `formatted_text` output formats
  - `json_string` returns raw GeoJSON data as parseable JSON string
  - `formatted_text` returns human-readable text with place names, addresses, and coordinates
  - Default to `formatted_text` for backward compatibility
  - Comprehensive test coverage for both output formats

## v0.1.0 (2025-06-12)

- **Support-NPM-Package**: Introduce the NPM package of this mcp-server

## v0.0.1 (2025-06-11)

- First tag release
