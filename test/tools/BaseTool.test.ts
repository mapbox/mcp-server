// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect, vi } from 'vitest';
import { BaseTool } from '../../src/tools/BaseTool.js';
import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Create a concrete test implementation of BaseTool
class TestTool extends BaseTool<
  typeof TestInputSchema,
  typeof TestOutputSchema
> {
  name = 'test_tool';
  description = 'A test tool';
  annotations = {
    title: 'Test Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };

  async run(): Promise<CallToolResult> {
    return {
      content: [{ type: 'text', text: 'test' }],
      isError: false
    };
  }

  // Expose validateOutput for testing
  public testValidateOutput<T>(rawData: unknown): T {
    return this.validateOutput<T>(rawData);
  }

  // Expose log method for testing
  public testLog(
    level: 'debug' | 'info' | 'warning' | 'error',
    data: unknown
  ): void {
    this.log(level, data);
  }
}

const TestInputSchema = z.object({
  input: z.string()
});

const TestOutputSchema = z.object({
  output: z.string(),
  count: z.number()
});

describe('BaseTool', () => {
  describe('validateOutput', () => {
    it('should return validated data when schema validation succeeds', () => {
      const tool = new TestTool({
        inputSchema: TestInputSchema,
        outputSchema: TestOutputSchema
      });

      const rawData = {
        output: 'test result',
        count: 42
      };

      const result = tool.testValidateOutput(rawData);

      expect(result).toEqual(rawData);
    });

    it('should return raw data and log warning when schema validation fails', () => {
      const tool = new TestTool({
        inputSchema: TestInputSchema,
        outputSchema: TestOutputSchema
      });

      // Spy on the log method
      const logSpy = vi.spyOn(tool as any, 'log');

      const rawData = {
        output: 'test result',
        count: 'not a number' // Invalid: should be a number
      };

      const result = tool.testValidateOutput(rawData);

      // Should return raw data despite validation failure
      expect(result).toEqual(rawData);

      // Should have logged a warning
      expect(logSpy).toHaveBeenCalledWith(
        'warning',
        expect.stringContaining('Output schema validation failed')
      );
    });

    it('should return raw data when no output schema is provided', () => {
      const tool = new TestTool({
        inputSchema: TestInputSchema
        // No outputSchema
      });

      const rawData = {
        anything: 'goes',
        here: 123
      };

      const result = tool.testValidateOutput(rawData);

      expect(result).toEqual(rawData);
    });

    it('should handle array data with validation failure', () => {
      const ArrayOutputSchema = z.object({
        items: z.array(z.string())
      });

      const tool = new TestTool({
        inputSchema: TestInputSchema,
        outputSchema: ArrayOutputSchema as any
      });

      const logSpy = vi.spyOn(tool as any, 'log');

      const rawData = {
        items: ['string', 123, 'another string'] // Invalid: 123 is not a string
      };

      const result = tool.testValidateOutput(rawData);

      // Should return raw data despite validation failure
      expect(result).toEqual(rawData);

      // Should have logged a warning
      expect(logSpy).toHaveBeenCalledWith(
        'warning',
        expect.stringContaining('Output schema validation failed')
      );
    });
  });

  describe('server binding', () => {
    // Records the server observed at entry and again after an await, so a
    // binding that only holds until the first suspension point is caught.
    class ObservingTool extends BaseTool<typeof TestInputSchema> {
      name = 'observing_tool';
      description = 'Reports which server its invocation is bound to';
      annotations = { title: 'Observing Tool', readOnlyHint: true };

      async run(): Promise<CallToolResult> {
        const before = this.activeServer;
        await new Promise((resolve) => setTimeout(resolve, 0));
        const after = this.activeServer;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                before: (before as any)?.id ?? null,
                after: (after as any)?.id ?? null
              })
            }
          ],
          isError: false
        };
      }
    }

    // Minimal McpServer stand-in that captures the callback installTo
    // registers, and carries an id so a call can be traced to its server.
    function createFakeServer(id: string) {
      let registered: (args: any, extra: any) => Promise<CallToolResult>;
      const server = {
        id,
        server: {},
        registerTool: (_name: string, _config: any, cb: any) => {
          registered = cb;
          return {};
        }
      };
      return {
        server: server as any,
        invoke: () => registered({}, {})
      };
    }

    function observed(result: CallToolResult) {
      return JSON.parse((result.content[0] as { text: string }).text);
    }

    function installedInTwoServers() {
      const tool = new ObservingTool({ inputSchema: TestInputSchema });
      const a = createFakeServer('a');
      const b = createFakeServer('b');
      tool.installTo(a.server);
      tool.installTo(b.server);
      return { tool, a, b };
    }

    it('routes each invocation to the server that registered its callback', async () => {
      const { a, b } = installedInTwoServers();

      // Installing into b must not redirect the callback registered on a.
      expect(observed(await a.invoke()).before).toBe('a');
      expect(observed(await b.invoke()).before).toBe('b');
    });

    it('keeps concurrent invocations on separate servers from cross-binding', async () => {
      const { a, b } = installedInTwoServers();

      const [fromA, fromB] = await Promise.all([a.invoke(), b.invoke()]);

      expect(observed(fromA)).toEqual({ before: 'a', after: 'a' });
      expect(observed(fromB)).toEqual({ before: 'b', after: 'b' });
    });

    it('falls back to the installed server when run() is called directly', async () => {
      const tool = new ObservingTool({ inputSchema: TestInputSchema });
      const a = createFakeServer('a');
      tool.installTo(a.server);

      // A direct run() has no registered callback to take a binding from.
      expect(observed(await tool.run()).before).toBe('a');
    });

    it('reports no server when the tool was never installed', async () => {
      const tool = new ObservingTool({ inputSchema: TestInputSchema });

      expect(observed(await tool.run()).before).toBeNull();
    });
  });
});
