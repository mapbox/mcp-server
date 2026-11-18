# AI Agent Instructions for Mapbox MCP Server

> **Note**: If you're using Claude Code specifically, see CLAUDE.md instead. This file is for general AI coding assistants.

## What This Project Does

This is an MCP (Model Context Protocol) server that provides AI applications with geospatial intelligence capabilities through Mapbox APIs. It enables AI agents to understand locations, navigate the physical world, and access spatial data including geocoding, search, routing, travel time analysis, and map visualization.

## Tech Stack

- **Runtime**: Node.js 22+ LTS
- **Language**: TypeScript (strict mode)
- **Testing**: Vitest
- **Package Manager**: pnpm (workspace)

## Project Structure

The repo is a pnpm workspace. The server is the `@mapbox/mcp-server` package in `servers/mcp-server/`:

```
servers/mcp-server/src/
├── index.ts                    # Main MCP server entry point
├── config/toolConfig.ts        # Tool configuration parser
├── tools/                      # MCP tool implementations
│   ├── MapboxApiBasedTool.ts   # Base class for Mapbox API tools
│   ├── toolRegistry.ts         # Tool registration system
│   └── */Tool.ts               # Individual tool implementations
├── resources/                  # MCP resources (static data)
│   └── resourceRegistry.ts
└── utils/
    ├── httpPipeline.ts         # HTTP policy pipeline system
    └── tracing.ts              # OpenTelemetry instrumentation

servers/mcp-server/test/        # Mirrors src/ structure
```

## Critical Patterns

### HTTP Request Architecture

- **Never patch global.fetch** - use `HttpPipeline` with dependency injection
- All HTTP requests flow through the pipeline system (servers/mcp-server/src/utils/httpPipeline.ts:21)
- Tools receive `httpRequest` via constructor (servers/mcp-server/src/tools/toolRegistry.ts:22-29)

### Tool Development

- Extend `MapboxApiBasedTool` base class (servers/mcp-server/src/tools/MapboxApiBasedTool.ts:16)
- Accept `httpRequest` parameter in constructor for testability
- Register in `ALL_TOOLS` array (servers/mcp-server/src/tools/toolRegistry.ts:18)
- Use `pnpm exec plop create-tool` (from `servers/mcp-server`) for scaffolding new tools

### Testing

- Use Vitest exclusively
- Mock external APIs - no real network calls in tests
- Use dependency injection to inject mock fetch functions
- Tests mirror `src/` directory structure

## Essential Commands

```bash
pnpm install             # Install dependencies (from the repo root)
cd servers/mcp-server
pnpm test                # Run tests
pnpm run build           # Compile TypeScript
pnpm run lint            # Check code quality (auto-fixed by pre-commit hooks)
pnpm run inspect:build   # Test with MCP inspector
pnpm exec plop create-tool  # Scaffold a new tool
```

## Common Pitfalls to Avoid

1. **Don't patch globals** - especially `global.fetch`
2. **Don't make real network calls in tests** - use mocks
3. **Don't commit without tests** - new features need test coverage
4. **Don't hardcode secrets** - use environment variables
5. **Don't ignore type errors** - strict TypeScript is enforced

## Documentation

- **CLAUDE.md** - Detailed standards and patterns for Claude Code users
- **servers/mcp-server/docs/engineering_standards.md** - Complete engineering guidelines
- **servers/mcp-server/docs/tracing.md** - OpenTelemetry setup
- **servers/mcp-server/README.md** - User-facing documentation and integration guides

## Factual Errors to Watch For

When analyzing or modifying this codebase:

- The HTTP pipeline class is `HttpPipeline`, not `PolicyPipeline`
- The HTTP pipeline file is `servers/mcp-server/src/utils/httpPipeline.ts`, not `fetchRequest.ts`
- Base tool class uses `httpRequest` parameter, not `fetch`

---

For detailed code quality standards, testing requirements, and collaboration guidelines, see servers/mcp-server/docs/engineering_standards.md.
