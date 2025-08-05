import {
  McpServer,
  RegisteredTool
} from '@modelcontextprotocol/sdk/server/mcp';
import { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { z, ZodTypeAny } from 'zod';

export const OutputSchema = z.object({
  content: z.array(
    z.union([
      z.object({
        type: z.literal('text'),
        text: z.string()
      }),
      z.object({
        type: z.literal('image'),
        data: z.string(),
        mimeType: z.string()
      })
    ])
  ),
  isError: z.boolean().default(false)
});

export abstract class MapboxApiBasedTool<InputSchema extends ZodTypeAny> {
  abstract readonly name: string;
  abstract readonly description: string;

  readonly inputSchema: InputSchema;
  protected server: McpServer | null = null;

  static readonly MAPBOX_ACCESS_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;
  static readonly MAPBOX_API_ENDPOINT =
    process.env.MAPBOX_API_ENDPOINT || 'https://api.mapbox.com/';

  constructor(params: { inputSchema: InputSchema }) {
    this.inputSchema = params.inputSchema;
  }

  /**
   * Validates if a string has the format of a JWT token (header.payload.signature)
   * Docs: https://docs.mapbox.com/api/accounts/tokens/#token-format
   * @param token The token string to validate
   * @returns boolean indicating if the token has valid JWT format
   */
  private isValidJwtFormat(token: string): boolean {
    // JWT consists of three parts separated by dots: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    // Check that all parts are non-empty
    return parts.every((part) => part.length > 0);
  }

  /**
   * Validates and runs the tool logic.
   */
  async run(
    rawInput: unknown,
    extra?: RequestHandlerExtra<any, any>
  ): Promise<z.infer<typeof OutputSchema>> {
    try {
      // First check if token is provided via authentication context
      // Check both standard token field and accessToken in extra for compatibility
      // In the streamableHttp, the authInfo is injected into extra from `req.auth`
      // https://github.com/modelcontextprotocol/typescript-sdk/blob/main/src/server/streamableHttp.ts#L405
      const authToken = extra?.authInfo?.token;
      const accessToken = authToken || MapboxApiBasedTool.MAPBOX_ACCESS_TOKEN;
      if (!accessToken) {
        throw new Error(
          'No access token available. Please provide via Bearer auth or MAPBOX_ACCESS_TOKEN env var'
        );
      }

      // Validate that the token has the correct JWT format
      if (!this.isValidJwtFormat(accessToken)) {
        throw new Error('Access token is not in valid JWT format');
      }

      const input = this.inputSchema.parse(rawInput);
      const result = await this.execute(input, accessToken);

      // Check if result is already a content object (image or text)
      if (
        result &&
        typeof result === 'object' &&
        (result.type === 'image' || result.type === 'text')
      ) {
        return {
          content: [result],
          isError: false
        };
      }

      // Otherwise return as text
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
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

  /**
   * Tool logic to be implemented by subclasses.
   */
  protected abstract execute(
    _input: z.infer<InputSchema>,
    accessToken: string
  ): Promise<any>;

  /**
   * Installs the tool to the given MCP server.
   */
  installTo(server: McpServer): RegisteredTool {
    this.server = server;
    return server.tool(
      this.name,
      this.description,
      (this.inputSchema as unknown as z.ZodObject<any>).shape,
      (args, extra) => this.run(args, extra)
    );
  }

  /**
   * Helper method to send logging messages
   */
  protected log(
    level: 'debug' | 'info' | 'warning' | 'error',
    data: any
  ): void {
    if (this.server) {
      this.server.server.sendLoggingMessage({ level, data });
    }
  }
}
