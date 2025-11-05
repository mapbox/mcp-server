# Mapbox MCP Server Engineering Standards

This document defines the standards and best practices for all contributors to the Mapbox MCP server. Adhering to these guidelines ensures code quality, maintainability, and a consistent developer experience.

## Toolchain

- **Node.js:** Use the current LTS version.
- **TypeScript:** All code must be written in TypeScript.
- **Vitest:** All tests must use Vitest.
- **npm:** Use npm for all package management and scripts.

## Project Structure

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

---

## 1. Code Quality

- **TypeScript Only:** All code must be written in TypeScript. No JavaScript files in `src/` or `test/`.
- **Linting:** All code must pass ESLint and Prettier checks before merging. Run `npm run lint` and `npm run format`.
- **Strict Typing:** Use strict types. Avoid `any` unless absolutely necessary and justified with a comment.
- **No Global Pollution:** Do not patch or override global objects (e.g., `global.fetch`). Use dependency injection and explicit pipelines.

---

## 2. Testing

- **Test Coverage:** All new features and bug fixes must include unit tests. Aim for 100% coverage on critical logic.
- **Testing Framework:** Use Vitest for all tests. Place tests in the `test/` directory, mirroring the `src/` structure.
- **Mocking:** Use dependency injection for testability. Mock external services and APIs; do not make real network calls in tests.
- **CI Passing:** All tests must pass in CI before merging.

---

## 3. Documentation

- **JSDoc:** All public classes, methods, and exported functions must have JSDoc comments.
- **README:** Update the main `README.md` with any new features, breaking changes, or setup instructions.
- **Changelog:** All user-facing changes must be documented in `CHANGELOG.md` following semantic versioning.

---

## 4. API & Tooling

- **Explicit Pipelines:** Use the `PolicyPipeline` for all HTTP requests. Add policies (e.g., User-Agent, Retry) via the pipeline, not by patching globals.
- **Tool Registration:** All tools must be registered via the standard interface and support dependency injection for fetch/pipeline.
- **Error Handling:** Handle and log errors gracefully. Do not swallow exceptions.

### Code Examples

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

---

## 5. Collaboration

- **Pull Requests:** All changes must be submitted via pull request. PRs should be small, focused, and reference relevant issues.
- **Reviews:** At least one approval from a core maintainer is required before merging.
- **Issue Tracking:** Use GitHub Issues for bugs, features, and technical debt. Link PRs to issues.

---

## 6. Security & Secrets

- **No Secrets in Code:** Never commit API keys, tokens, or secrets. Use environment variables and `.env` files (excluded from git).
- **Dependency Updates:** Keep dependencies up to date and monitor for vulnerabilities.

---

## 7. Automation

- **Pre-commit Hooks:** Use pre-commit hooks to enforce linting and formatting.
- **CI/CD:** All merges to `main` must pass CI checks and deploy to the appropriate environment.

---

## 8. Accessibility & Inclusion

- **Naming:** Use clear, descriptive names for files, variables, and tools.
- **Comments:** Write comments for complex logic. Assume the next reader is not the original author.

---

## Getting Started

1. Install dependencies: `npm install`
2. Run tests: `npm test`
3. Check linting: `npm run lint`
4. Format code: `npm run format`
5. Build project: `npm run build`
6. Test project: `npm run test`

---

## Environment Variables

### OpenTelemetry Configuration

- `OTEL_EXPORTER_OTLP_ENDPOINT` — OTLP endpoint URL (e.g., `http://localhost:4318`)
- `OTEL_SERVICE_NAME` — Override service name (default: `mapbox-mcp-server`)
- `OTEL_EXPORTER_OTLP_HEADERS` — JSON string of additional headers for OTLP exporter
- `OTEL_LOG_LEVEL` — OTEL diagnostic log level: `NONE` (default), `ERROR`, `WARN`, `INFO`, `DEBUG`, `VERBOSE`. Set to `NONE` to prevent OTEL logs from polluting stdio transport.

---

## Enforcement

Failure to follow these standards may result in PR changes being requested or, in repeated cases, reversion of non-compliant code.

---
