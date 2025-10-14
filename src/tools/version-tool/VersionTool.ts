// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { BaseTool } from '../BaseTool.js';
import { getVersionInfo } from '../../utils/versionUtils.js';
import { VersionSchema } from './VersionTool.input.schema.js';
import {
  VersionResponseSchema,
  type VersionResponse
} from './VersionTool.output.schema.js';
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
    const versionInfo = getVersionInfo();

    const versionText = `MCP Server Version Information:
- Name: ${versionInfo.name}
- Version: ${versionInfo.version}
- SHA: ${versionInfo.sha}
- Tag: ${versionInfo.tag}
- Branch: ${versionInfo.branch}`;

    // Validate output against schema with graceful fallback
    let validatedVersionInfo: VersionResponse;
    try {
      validatedVersionInfo = VersionResponseSchema.parse(versionInfo);
    } catch (validationError) {
      this.log(
        'warning',
        `Output schema validation failed: ${validationError instanceof Error ? validationError.message : 'Unknown validation error'}`
      );
      // Graceful fallback to raw data
      validatedVersionInfo = versionInfo as VersionResponse;
    }

    return {
      content: [{ type: 'text' as const, text: versionText }],
      structuredContent: validatedVersionInfo,
      isError: false
    };
  }
}
