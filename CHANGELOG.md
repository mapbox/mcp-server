## Unreleased

## 0.9.0 - 2026-02-23

### New Features

- **place_details_tool**: New tool to retrieve detailed information about a specific place by Mapbox ID
  - Accepts a `mapbox_id` from search results (`search_and_geocode_tool`, `category_search_tool`, `reverse_geocode_tool`)
  - Optional `attribute_sets` parameter: `basic`, `photos`, `visit` (hours, rating, price), `venue` (phone, website, social media)
  - Optional `language` and `worldview` parameters
  - Returns formatted text summary plus structured GeoJSON Feature content
  - Opening hours formatted as readable per-day text (e.g. "Monday: 9 AM – 9 PM") rather than raw JSON

### Bug Fixes

- **search_and_geocode_tool**, **category_search_tool**: Include `mapbox_id` in formatted text output so models can chain directly to `place_details_tool` without re-fetching results as JSON
- **category_search_tool**: Fix schema validation failures on Japanese and other international place data
  - Added `.passthrough()` to all context sub-schemas to allow extra fields returned by the API
  - Made `country_code`, `country_code_alpha_3`, `region_code`, and `region_code_full` optional to match real API responses
  - Fixed `BaseTool` to pass the full Zod schema (not just `.shape`) to the MCP SDK so `.passthrough()` settings are preserved during structured-content validation

### Registry

- Added hosted MCP endpoint (`https://mcp.mapbox.com/mcp`) to `server.json` `remotes` for registry discoverability

### Dependencies

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

## Unreleased

### Features Added

- **Large Response Handling**: DirectionsTool now creates temporary resources for responses >50KB
  - Prevents context window overflow on long-distance routes
  - Returns summary with distance, duration, and resource URI
  - Full route geometry available via MCP resource API
  - Temporary resources expire after 30 minutes
  - Resource URI format: `mapbox://temp/directions-{id}`
  - Updated tool description to guide LLMs: use geometries="none" for planning, geometries="geojson" only for visualization
  - Returns lightweight structured content for large responses (summary data without geometry) to satisfy output schema validation
  - Updated `search-along-route` prompt to use `geometries="none"` and linear interpolation for route sampling instead of extracting coordinates from geometry

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
