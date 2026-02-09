# Mapbox MCP Server

An MCP (Model Context Protocol) server that provides AI agents with geospatial intelligence capabilities through Mapbox APIs. This enables AI applications to understand locations, navigate the physical world, and access rich spatial data including geocoding, search, routing, travel time analysis, and map visualization.

## Tech Stack

- **Runtime**: Node.js 22+ LTS
- **Language**: TypeScript (strict mode)
- **Testing**: Vitest
- **Package Manager**: npm

## Project Structure

```
src/
├── index.ts                    # Main MCP server entry point
├── config/toolConfig.ts        # Tool configuration parser
├── tools/                      # MCP tool implementations
│   ├── MapboxApiBasedTool.ts   # Base class for Mapbox API tools
│   ├── toolRegistry.ts         # Tool registration system
│   └── */Tool.ts               # Individual tool implementations
├── resources/                  # MCP resources (static data)
│   ├── MapboxApiBasedResource.ts
│   └── resourceRegistry.ts
└── utils/
    ├── httpPipeline.ts         # HTTP policy pipeline system
    ├── tracing.ts              # OpenTelemetry instrumentation
    └── versionUtils.ts         # Version info utilities

test/                           # Mirrors src/ structure
```

## Key Patterns

### Tool Architecture

- All Mapbox API tools extend `MapboxApiBasedTool` (src/tools/MapboxApiBasedTool.ts:16)
- Tools receive `httpRequest` via dependency injection (src/tools/toolRegistry.ts:22-29)
- Register new tools in `ALL_TOOLS` array (src/tools/toolRegistry.ts:18)

### HTTP Pipeline System

- **Never patch global.fetch** - use `HttpPipeline` with dependency injection instead
- Pipeline applies policies (User-Agent, Retry, etc.) to all HTTP requests (src/utils/httpPipeline.ts:21)
- Default pipeline exported as `httpRequest` (src/utils/httpPipeline.ts)

### Resource System

- Static reference data exposed as MCP resources (src/resources/)
- Resources use URI pattern: `mapbox://resource-name`
- Example: category list at `mapbox://categories` or `mapbox://categories/{language}`

## Essential Workflows

### Development

```bash
npm install              # Install dependencies
npm test                 # Run tests with Vitest
npm run build            # Compile TypeScript
npm run inspect:build    # Test with MCP inspector
```

### Creating a New Tool

```bash
# Interactive mode (requires TTY - use in terminal):
npx plop create-tool

# Non-interactive mode (for AI agents, CI, or scripts):
npx plop create-tool "ToolName" "tool_name_tool"

# Example:
npx plop create-tool "Search" "search_tool"
# Creates SearchTool in src/tools/search-tool/ with schemas and tests
```

**Note**: When running from AI agents or non-TTY environments (like Claude Code), always use non-interactive mode with command-line arguments to avoid readline errors.

### Pre-commit

- Husky hooks auto-run linting and formatting
- All checks must pass before commit

### Pull Requests

When creating pull requests:

- **Always update CHANGELOG.md** - Document what changed, why, and any breaking changes
- Follow the existing changelog format (check recent entries for examples)
- Add your entry under the "Unreleased" section at the top
- Include the PR number and a brief description of the change

### Release Process

When preparing a new release:

```bash
# Prepare CHANGELOG for release (replaces "Unreleased" with version and date)
npm run changelog:prepare-release 1.0.0

# Review changes, then commit and tag
git add CHANGELOG.md
git commit -m "Release v1.0.0"
git tag v1.0.0
git push && git push --tags
```

The `changelog:prepare-release` script automatically:

- Replaces "## Unreleased" with "## {version} - {date}"
- Adds a new empty "## Unreleased" section at the top
- Validates version format and CHANGELOG structure

## Important Constraints

- **Dependency Injection**: Tools must accept `httpRequest` parameter for testability
- **No Global Patching**: Use explicit pipelines instead of modifying globals
- **Strict Types**: Avoid `any` - add comment if absolutely necessary
- **Test Mocking**: Never make real network calls in tests

## Documentation

- **Detailed Standards**: See docs/engineering_standards.md for complete guidelines
- **Tracing Setup**: See docs/tracing.md for OpenTelemetry configuration
- **Integration Guides**: See docs/ for Claude Desktop, VS Code, Cursor, and Goose setup
