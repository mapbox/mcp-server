# Contributing to Mapbox MCP Server

Thank you for your interest in contributing! Please read this guide before submitting a pull request.

## Getting Started

```bash
git clone https://github.com/mapbox/mcp-server.git
cd mcp-server
pnpm install
pnpm --filter @mapbox/mcp-server test
```

The repo is a [pnpm](https://pnpm.io) workspace, and the server is the `@mapbox/mcp-server` package in `servers/mcp-server/`. The commands below run from that folder.

A Mapbox access token with appropriate scopes is required for most tools. Set `MAPBOX_ACCESS_TOKEN` in your environment.

## Pull Requests

- Keep PRs small and focused on a single change
- **Always update `servers/mcp-server/CHANGELOG.md`** — add your entry under the `Unreleased` section with the PR number
- All CI checks must pass before merging (lint, format, tests)
- At least one maintainer approval is required

### Out of Scope

We do not accept PRs that add listings, badges, or manifest files for third-party directories, registries, or "discovery" services (e.g. unsolicited `README.md` badges linking to an external site, or files like `beacon.json` with no functional purpose in this project). These will be closed without review.

## Standards & Guidelines

| Document                                                                       | Contents                                                                   |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| [engineering_standards.md](./servers/mcp-server/docs/engineering_standards.md) | Complete code quality, testing, documentation, and collaboration standards |
| [CLAUDE.md](./CLAUDE.md)                                                       | Patterns and workflows for contributors using Claude Code                  |
| [AGENTS.md](./AGENTS.md)                                                       | Guide for other AI coding assistants (Cursor, Continue, Aider, etc.)       |
| [.github/copilot-instructions.md](./.github/copilot-instructions.md)           | GitHub Copilot guidelines                                                  |

## Quick Reference

### Creating a New Tool

```bash
# Interactive (requires a TTY):
pnpm exec plop create-tool

# Non-interactive (for AI agents and CI):
pnpm exec plop create-tool "ToolName" "tool_name_tool"
```

### Before Committing

```bash
pnpm test           # All tests must pass
pnpm run lint       # ESLint (auto-fixed by pre-commit hook)
pnpm run format     # Prettier (auto-fixed by pre-commit hook)
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
