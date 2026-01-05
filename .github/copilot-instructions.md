# GitHub Copilot Guidelines for Mapbox MCP Server

This document defines responsible use of GitHub Copilot in this repository. Copilot is a productivity tool that must work within our engineering standards.

## Core Principles

### 1. Review, Don't Auto-Accept

- **Always review** Copilot suggestions before accepting
- **Understand first** - only use code you fully comprehend
- **No blind copy-paste** - adapt suggestions to project context
- **Iterate** - use suggestions as starting points, not final solutions

### 2. Security First

- **Never accept** suggestions with hardcoded secrets, tokens, or credentials
- **Review carefully** any code handling sensitive data
- **Environment variables** - ensure secrets use `.env` files, never committed

### 3. Quality Standards

- All Copilot code must comply with standards in **CLAUDE.md** and **docs/engineering_standards.md**
- Pre-commit hooks will enforce linting, formatting, and TypeScript strictness
- If Copilot suggests patterns inconsistent with the codebase, reject and write manually

### 4. Testing & Documentation

- Include unit tests for all Copilot-generated features or fixes
- Add or update JSDoc comments as you would for hand-written code
- Update README.md or CHANGELOG.md if user-facing changes

### 5. Collaboration

- All Copilot code goes through standard PR review process
- Mention in PR description if significant portion is Copilot-generated
- Provide feedback if Copilot produces poor/unsafe suggestions

## When to Avoid Copilot

- **Critical business logic** - prefer hand-written code with thorough review
- **Security-sensitive code** - authentication, authorization, data validation
- **Legal/compliance code** - licensing, terms of service, privacy policies
- **Architecture decisions** - let humans make strategic choices

## Learning from the Codebase

Copilot learns patterns from existing code. This codebase has strong conventions:

- Dependency injection for testability (see src/tools/)
- HttpPipeline for all HTTP requests (see src/utils/httpPipeline.ts)
- Consistent tool structure extending MapboxApiBasedTool

Let Copilot learn these patterns rather than explicitly re-teaching them.

---

**Remember**: Copilot is an assistant, not an authority. You own the code you commit.
