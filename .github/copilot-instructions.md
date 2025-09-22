# GitHub Copilot Usage & Standards for Mapbox MCP Server

This document defines how to use GitHub Copilot effectively and responsibly in the Mapbox MCP server repository. Following these guidelines ensures Copilot is a productive tool that supports, but does not replace, our engineering standards.

---

## 1. Copilot as an Assistant, Not an Authority

- **Review All Suggestions:** Never accept Copilot code without reviewing it for correctness, security, and style.
- **Understand Before You Use:** Only use Copilot suggestions you fully understand. If unsure, ask for clarification or write it yourself.
- **No Blind Copy-Paste:** Do not copy-paste large blocks of Copilot code without adapting to project context.

---

## 2. Code Quality & Consistency

- **Follow Project Standards:** All Copilot-generated code must comply with the standards in `CLAUDE.md` and our linting, typing, and testing requirements.
- **TypeScript Only:** Copilot suggestions must be in TypeScript for all code in `src/` and `test/`.
- **No Global Pollution:** Do not accept suggestions that patch or override global objects (e.g., `global.fetch`).

---

## 3. Testing & Documentation

- **Tests Required:** All Copilot-generated features or fixes must include appropriate unit tests.
- **JSDoc & Comments:** Add or edit documentation/comments for Copilot code as you would for hand-written code.

---

## 4. Security & Privacy

- **No Secrets:** Never accept suggestions that include hardcoded secrets, tokens, or credentials.
- **Sensitive Data:** Do not use Copilot to generate or handle sensitive data without review.

---

## 5. Collaboration & Review

- **Pull Requests:** All Copilot-generated code must go through the standard PR review process.
- **Attribution:** If a significant portion of a PR is Copilot-generated, mention it in the PR description.
- **Feedback:** If Copilot produces poor or unsafe suggestions, provide feedback to improve future results.

---

## 6. When Not to Use Copilot

- **Complex Business Logic:** For critical or complex business logic, prefer hand-written code and thorough review.
- **Legal/Compliance Code:** Do not use Copilot for code with legal, licensing, or compliance implications without explicit review.

---

## 7. Continuous Improvement

- **Iterate:** Use Copilot to explore solutions, but always iterate and refine.
- **Propose Improvements:** Suggest updates to this document as Copilot and our practices evolve.

---
