import type {
  McpServer,
  ResourceTemplate
} from '@modelcontextprotocol/sdk/server/mcp.js';

export abstract class BaseResource {
  abstract readonly name: string;
  abstract readonly uriTemplate: string | ResourceTemplate;
  abstract readonly title: string;
  abstract readonly description: string;

  installTo(server: McpServer): void {
    if (typeof this.uriTemplate === 'string') {
      server.resource(
        this.name,
        this.uriTemplate,
        {
          description: this.description,
          mimeType: 'application/json'
        },
        this.readCallback.bind(this) as any
      );
    } else {
      server.resource(
        this.name,
        this.uriTemplate,
        {
          description: this.description,
          mimeType: 'application/json'
        },
        this.readCallback.bind(this) as any
      );
    }
  }

  protected abstract readCallback(
    uri: URL,
    variables?: Record<string, any>
  ): Promise<{
    contents: Array<{
      uri: string;
      mimeType?: string;
      text?: string;
      blob?: string;
    }>;
  }>;
}
