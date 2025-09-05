import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Base class for MCP resources
 */
export abstract class BaseResource {
  abstract readonly name: string;
  abstract readonly uri: string;
  abstract readonly description: string;
  abstract readonly mimeType: string;

  /**
   * Install this resource to the MCP server
   */
  installTo(server: McpServer): void {
    server.resource(
      this.name,
      this.uri,
      {
        description: this.description,
        mimeType: this.mimeType
      },
      this.readCallback.bind(this)
    );
  }

  /**
   * Callback to read the resource content
   */
  protected abstract readCallback(
    uri: URL,
    extra: any
  ): Promise<{
    contents: Array<{ uri: string; mimeType: string; text: string }>;
  }>;
}
