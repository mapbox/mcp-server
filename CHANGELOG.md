## 0.6.0 (Unreleased)

### Features Added

- Support for `structuredContent` for all applicable tools
- Registers output schemas with the MCP server and validates schemas

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
