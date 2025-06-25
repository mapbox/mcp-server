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
