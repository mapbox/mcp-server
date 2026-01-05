# AI Agent Instructions for Mapbox MCP Server

> **Note**: If you're using Claude Code specifically, see CLAUDE.md instead. This file is for general AI coding assistants.

## What This Project Does

This is an MCP (Model Context Protocol) server that provides AI applications with geospatial intelligence capabilities through Mapbox APIs. It enables AI agents to understand locations, navigate the physical world, and access spatial data including geocoding, search, routing, travel time analysis, and map visualization.

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
│   └── resourceRegistry.ts
└── utils/
    ├── httpPipeline.ts         # HTTP policy pipeline system
    └── tracing.ts              # OpenTelemetry instrumentation

test/                           # Mirrors src/ structure
```

## Critical Patterns

### HTTP Request Architecture

- **Never patch global.fetch** - use `HttpPipeline` with dependency injection
- All HTTP requests flow through the pipeline system (src/utils/httpPipeline.ts:21)
- Tools receive `httpRequest` via constructor (src/tools/toolRegistry.ts:22-29)

### Tool Development

- Extend `MapboxApiBasedTool` base class (src/tools/MapboxApiBasedTool.ts:16)
- Accept `httpRequest` parameter in constructor for testability
- Register in `ALL_TOOLS` array (src/tools/toolRegistry.ts:18)
- Use `npx plop create-tool` for scaffolding new tools

### Testing

- Use Vitest exclusively
- Mock external APIs - no real network calls in tests
- Use dependency injection to inject mock fetch functions
- Tests mirror `src/` directory structure

## Essential Commands

```bash
npm install              # Install dependencies
npm test                 # Run tests
npm run build            # Compile TypeScript
npm run lint             # Check code quality (auto-fixed by pre-commit hooks)
npm run inspect:build    # Test with MCP inspector
npx plop create-tool     # Scaffold a new tool
```

## Common Pitfalls to Avoid

1. **Don't patch globals** - especially `global.fetch`
2. **Don't make real network calls in tests** - use mocks
3. **Don't commit without tests** - new features need test coverage
4. **Don't hardcode secrets** - use environment variables
5. **Don't ignore type errors** - strict TypeScript is enforced

## Documentation

- **CLAUDE.md** - Detailed standards and patterns for Claude Code users
- **docs/engineering_standards.md** - Complete engineering guidelines
- **docs/tracing.md** - OpenTelemetry setup
- **README.md** - User-facing documentation and integration guides

## Factual Errors to Watch For

When analyzing or modifying this codebase:

- The HTTP pipeline class is `HttpPipeline`, not `PolicyPipeline`
- The HTTP pipeline file is `src/utils/httpPipeline.ts`, not `fetchRequest.ts`
- Base tool class uses `httpRequest` parameter, not `fetch`

---

For detailed code quality standards, testing requirements, and collaboration guidelines, see docs/engineering_standards.md.
