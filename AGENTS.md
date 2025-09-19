# AI Agent Instructions for Mapbox MCP Server

## Project Overview

This is a Model Context Protocol (MCP) server that provides AI agents with access to Mapbox's geospatial services including geocoding, directions, search, and mapping capabilities. The server implements tools for forward/reverse geocoding, route planning, point-of-interest search, static map generation, and geographic data analysis.

## Architecture & Standards

### Core Technologies

- **Runtime:** Node.js LTS
- **Language:** TypeScript (strict mode, no JavaScript files)
- **Testing:** Vitest with comprehensive unit tests
- **Package Management:** npm
- **Code Quality:** ESLint + Prettier, pre-commit hooks

### Key Design Patterns

- **Policy Pipeline Architecture:** All HTTP requests use `PolicyPipeline` with configurable policies (UserAgent, Retry, etc.)
- **Dependency Injection:** Tools accept fetch functions/pipelines via constructor for testability
- **No Global Pollution:** Avoid patching global objects; use explicit dependency injection
- **Tool Registration:** Standard MCP tool interface with schema validation

### Project Structure

```
src/
├── index.ts                    # Main MCP server entry point
├── config/toolConfig.ts        # Tool configuration parser
├── tools/                      # MCP tool implementations
│   ├── MapboxApiBasedTool.ts   # Base class for Mapbox API tools
│   ├── toolRegistry.ts         # Tool registration system
│   └── */Tool.ts               # Individual tool implementations
└── utils/
    ├── fetchRequest.ts         # HTTP policy pipeline system
    └── versionUtils.ts         # Version info utilities

test/                           # Mirror src/ structure for tests
```

## Code Quality Guidelines

### TypeScript Standards

- Use strict typing; avoid `any` unless justified with comments
- All public APIs require JSDoc documentation
- Follow naming conventions: PascalCase for classes, camelCase for functions/variables
- Export interfaces and types for external consumption

### Testing Requirements

- **Coverage:** Aim for 100% on critical business logic
- **Isolation:** Mock external APIs; no real network calls in tests
- **Structure:** Tests mirror `src/` directory structure
- **Framework:** Use Vitest exclusively; leverage `vi.fn()` for mocking

### HTTP Request Handling

```typescript
// Correct: Use PolicyPipeline with dependency injection
const pipeline = new PolicyPipeline();
pipeline.usePolicy(new UserAgentPolicy(userAgent));
pipeline.usePolicy(new RetryPolicy(3, 200, 2000));

class MyTool extends MapboxApiBasedTool {
  constructor(fetch: typeof fetch = fetchClient) {
    super({ inputSchema: MySchema });
    this.fetch = fetch;
  }
}

// Incorrect: Global fetch patching
global.fetch = myCustomFetch; // ❌ Don't do this
```

### Error Handling

- Handle and log errors gracefully
- Don't swallow exceptions without proper logging
- Use appropriate HTTP status codes
- Provide meaningful error messages to users

## Development Workflow

### Pull Request Standards

1. **Size:** Keep PRs focused and reasonably sized
2. **Testing:** Include unit tests for all new functionality
3. **Documentation:** Update README.md, CHANGELOG.md as needed
4. **Review:** Require approval from core maintainer
5. **CI:** All tests and linting must pass

### Commit Standards

- Use conventional commit format
- Reference GitHub issues where applicable
- Include breaking change notes in commit body

### Security Guidelines

- **No Secrets:** Never commit API keys, tokens, or credentials
- **Environment Variables:** Use `.env` files (git-ignored) for local development
- **Dependencies:** Keep packages updated; monitor for vulnerabilities
- **Code Review:** Security-sensitive changes require thorough review

## Tool Development Patterns

### Creating New Tools

1. Extend `MapboxApiBasedTool<T>` base class
2. Define input schema with Zod validation
3. Implement `execute()` method with proper error handling
4. Accept fetch function via constructor for testability
5. Include comprehensive unit tests

### Example Tool Structure

```typescript
export class ExampleTool extends MapboxApiBasedTool<typeof ExampleSchema> {
  name = 'example_tool';
  description = 'Tool description for AI agents';

  constructor(fetch: typeof fetch = fetchClient) {
    super({ inputSchema: ExampleSchema });
    this.fetch = fetch;
  }

  protected async execute(
    input: z.infer<typeof ExampleSchema>,
    accessToken: string
  ): Promise<{ type: 'text'; text: string }> {
    // Implementation
  }
}
```

### Testing Tools

```typescript
describe('ExampleTool', () => {
  beforeEach(() => {
    vi.stubEnv('MAPBOX_ACCESS_TOKEN', 'test-token');
  });

  it('handles valid input', async () => {
    const { fetch, mockFetch } = setupFetch({
      json: async () => ({ data: 'test' })
    });

    const tool = new ExampleTool(fetch);
    const result = await tool.run({
      /* test input */
    });

    expect(result.type).toBe('text');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
```

## AI Agent Collaboration Notes

### When Working with This Codebase

1. **Read Standards First:** Always consult `CLAUDE.md` for project standards
2. **Use Existing Patterns:** Follow established patterns in `src/tools/` examples
3. **Test-Driven Development:** Write tests alongside or before implementation
4. **Policy Pipeline:** Use `fetchClient` or inject custom fetch for HTTP requests
5. **Documentation:** Update relevant docs when adding features

### Common Pitfalls to Avoid

- Patching global objects (especially `fetch`)
- Missing unit tests for new functionality
- Hardcoding configuration values
- Using JavaScript instead of TypeScript
- Ignoring ESLint/Prettier warnings
- Making real network calls in tests

### Getting Started

1. Install dependencies: `npm install`
2. Run tests: `npm test`
3. Check linting: `npm run lint`
4. Format code: `npm run format`
5. Build project: `npm run build`
6. Test project: `npm run test`

---

This codebase prioritizes maintainability, testability, and adherence to MCP standards. When in doubt, refer to existing tool implementations and follow established patterns.
