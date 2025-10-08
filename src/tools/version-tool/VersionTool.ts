// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { BaseTool } from '../BaseTool.js';
import { getVersionInfo } from '../../utils/versionUtils.js';
import { VersionSchema } from './VersionTool.schema.js';
import type { z } from 'zod';
import type { OutputSchema } from '../MapboxApiBasedTool.schema.js';

export class VersionTool extends BaseTool<typeof VersionSchema> {
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
    super({ inputSchema: VersionSchema });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async run(_rawInput: unknown): Promise<z.infer<typeof OutputSchema>> {
    try {
      const versionInfo = getVersionInfo();

      const versionText = `MCP Server Version Information:
- Name: ${versionInfo.name}
- Version: ${versionInfo.version}
- SHA: ${versionInfo.sha}
- Tag: ${versionInfo.tag}
- Branch: ${versionInfo.branch}`;

      return {
        content: [{ type: 'text', text: versionText }],
        structuredContent: versionInfo as unknown as Record<string, unknown>,
        isError: false
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.log(
        'error',
        `${this.name}: Error during execution: ${errorMessage}`
      );

      return {
        content: [
          {
            type: 'text',
            text: errorMessage
          }
        ],
        isError: true
      };
    }
  }
}
