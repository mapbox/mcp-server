import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import { createLocalToolExecutionContext } from '../../utils/tracing.js';
// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { BaseTool } from '../BaseTool.js';
import { getVersionInfo } from '../../utils/versionUtils.js';
import { VersionSchema } from './VersionTool.input.schema.js';
import { VersionResponseSchema } from './VersionTool.output.schema.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export class VersionTool extends BaseTool<
  typeof VersionSchema,
  typeof VersionResponseSchema
> {
  readonly name = 'version_tool';
  readonly description =
    'Get the current version information of the MCP server';
  readonly annotations = {
    title: 'Version Information Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };

  constructor() {
    super({
      inputSchema: VersionSchema,
      outputSchema: VersionResponseSchema
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async run(_rawInput: unknown): Promise<CallToolResult> {
    // Create tracing context for this tool
    const toolContext = createLocalToolExecutionContext(this.name, 0);
    return await context.with(
      trace.setSpan(context.active(), toolContext.span),
      async () => {
        try {
          const versionInfo = getVersionInfo();
          const versionText = `MCP Server Version Information:\n- Name: ${versionInfo.name}\n- Version: ${versionInfo.version}\n- SHA: ${versionInfo.sha}\n- Tag: ${versionInfo.tag}\n- Branch: ${versionInfo.branch}`;
          const validatedVersionInfo = VersionResponseSchema.parse(versionInfo);
          toolContext.span.setStatus({ code: SpanStatusCode.OK });
          toolContext.span.end();
          return {
            content: [{ type: 'text' as const, text: versionText }],
            structuredContent: validatedVersionInfo,
            isError: false
          };
        } catch (validationError) {
          toolContext.span.setStatus({
            code: SpanStatusCode.ERROR,
            message:
              validationError instanceof Error
                ? validationError.message
                : 'Unknown validation error'
          });
          toolContext.span.end();
          this.log(
            'error',
            `Output schema validation failed: ${validationError instanceof Error ? validationError.message : 'Unknown validation error'}`
          );
          return {
            content: [
              {
                type: 'text' as const,
                text: 'VersionTool: Output schema validation failed.'
              }
            ],
            isError: true
          };
        }
      }
    );
  }
}
