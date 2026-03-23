# Contributing to Mapbox MCP Server

Thank you for your interest in contributing! Please read this guide before submitting a pull request.

## Getting Started

```bash
git clone https://github.com/mapbox/mcp-server.git
cd mcp-server
npm install
npm test
```

A Mapbox access token with appropriate scopes is required for most tools. Set `MAPBOX_ACCESS_TOKEN` in your environment.

## Pull Requests

- Keep PRs small and focused on a single change
- **Always update `CHANGELOG.md`** — add your entry under the `Unreleased` section with the PR number
- All CI checks must pass before merging (lint, format, tests)
- At least one maintainer approval is required

## Standards & Guidelines

| Document                                                             | Contents                                                                   |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [docs/engineering_standards.md](./docs/engineering_standards.md)     | Complete code quality, testing, documentation, and collaboration standards |
| [CLAUDE.md](./CLAUDE.md)                                             | Patterns and workflows for contributors using Claude Code                  |
| [AGENTS.md](./AGENTS.md)                                             | Guide for other AI coding assistants (Cursor, Continue, Aider, etc.)       |
| [.github/copilot-instructions.md](./.github/copilot-instructions.md) | GitHub Copilot guidelines                                                  |

## Quick Reference

### Creating a New Tool

```bash
# Interactive (requires a TTY):
npx plop create-tool

# Non-interactive (for AI agents and CI):
npx plop create-tool "ToolName" "tool_name_tool"
```

### Before Committing

```bash
npm test            # All tests must pass
npm run lint        # ESLint (auto-fixed by pre-commit hook)
npm run format      # Prettier (auto-fixed by pre-commit hook)
```

### Changelog Format

```markdown
## Unreleased

### Features Added

- **My Feature**: Description of what changed and why (#PR_NUMBER)
```

## Security

- Never commit API keys or tokens — use environment variables
- Run `npm audit` if you add or update dependencies
