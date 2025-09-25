import type {
  McpServer,
  RegisteredTool
} from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { getVersionInfo } from '../../utils/versionUtils.js';

const InputSchema = z.object({});

export class VersionTool {
  readonly name = 'version_tool';
  readonly description =
    'Get the current version information of the MCP server';
  readonly inputSchema = InputSchema;
  readonly annotations: ToolAnnotations = {
    title: 'Version Information Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };

  private server: McpServer | null = null;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async run(_rawInput: unknown): Promise<{
    content: Array<{
      type: 'text';
      text: string;
    }>;
    isError: boolean;
  }> {
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

  installTo(server: McpServer): RegisteredTool {
    this.server = server;
    return server.registerTool(
      this.name,
      {
        title: this.annotations.title,
        description: this.description,
        inputSchema: this.inputSchema.shape,
        annotations: this.annotations
      },
      this.run.bind(this)
    );
  }

  private log(level: 'debug' | 'info' | 'warning' | 'error', data: any): void {
    if (this.server) {
      this.server.server.sendLoggingMessage({ level, data });
    }
  }
}
