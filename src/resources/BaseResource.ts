import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export abstract class BaseResource {
  abstract readonly name: string;
  abstract readonly uri: string;
  abstract readonly description: string;
  abstract readonly mimeType: string;

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

  protected abstract readCallback(
    uri: URL,
    extra: any
  ): Promise<{
    contents: Array<{ uri: string; mimeType: string; text: string }>;
  }>;
}
