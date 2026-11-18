# Dependency Patches

Patches in this directory are applied to npm dependencies after `npm install` by [patch-package](https://github.com/ds300/patch-package) (see the `postinstall` script). There are none at the moment.

## History

### @modelcontextprotocol/sdk (retired)

Until the move to MCP TypeScript SDK v2, a patch to `@modelcontextprotocol/sdk` made output schema validation non-fatal: when a tool's `structuredContent` didn't match its output schema, or a tool with an output schema returned none, the SDK logged a warning instead of failing the tool call.

SDK v2 accepts any [Standard Schema](https://standardschema.dev/) as a tool's `outputSchema`, so the same behavior now comes from `src/tools/lenientOutputSchema.ts` (the published JSON Schema is unchanged, validation only warns) and `BaseTool.installTo` (a missing `structuredContent` is sent as `{}`), with no patch. `test/tools/lenientOutputSchema.test.ts` covers both through a real `tools/call`.

## Adding a patch

1. Edit the file in `node_modules/<package>/`.
2. Run `npx patch-package <package>`.
3. Commit the generated file in this directory and describe it here.
