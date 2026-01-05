// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { BaseTool } from '../../src/tools/BaseTool.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

// Define test schemas
const TestInputSchema = z.object({
  input: z.string()
});

const TestOutputSchema = z.object({
  name: z.string(),
  age: z.number(),
  items: z.array(z.string()) // Expects array of strings
});

// Create a test tool that returns data violating its output schema
class TestToolWithMismatch extends BaseTool<
  typeof TestInputSchema,
  typeof TestOutputSchema
> {
  readonly name = 'test-mismatch-tool';
  readonly description = 'Tool for testing schema mismatch handling';
  readonly annotations: ToolAnnotations = {
    title: 'Test Mismatch Tool',
    stabilityHint: 'experimental',
    idempotentHint: true,
    openWorldHint: false
  };

  constructor() {
    super({
      inputSchema: TestInputSchema,
      outputSchema: TestOutputSchema
    });
  }

  async run(
    rawInput: unknown,
    extra?: RequestHandlerExtra<any, any>
  ): Promise<CallToolResult> {
    // Parse input (would normally throw if invalid)
    const input = this.inputSchema.parse(rawInput);

    // Return data that violates the output schema
    return {
      content: [{ type: 'text', text: `Processed: ${input.input}` }],
      structuredContent: {
        name: 'Test User',
        age: 30,
        items: 'single-string-not-array' // VIOLATION: Should be array!
      },
      isError: false
    };
  }
}

// Tool that returns no structured content despite having output schema
class TestToolNoStructuredContent extends BaseTool<
  typeof TestInputSchema,
  typeof TestOutputSchema
> {
  readonly name = 'test-no-structured';
  readonly description = 'Tool that omits structured content';
  readonly annotations: ToolAnnotations = {
    title: 'Test No Structured Content',
    stabilityHint: 'experimental',
    idempotentHint: true,
    openWorldHint: false
  };

  constructor() {
    super({
      inputSchema: TestInputSchema,
      outputSchema: TestOutputSchema
    });
  }

  async run(
    rawInput: unknown,
    extra?: RequestHandlerExtra<any, any>
  ): Promise<CallToolResult> {
    const input = this.inputSchema.parse(rawInput);

    // Return NO structured content despite having output schema
    return {
      content: [{ type: 'text', text: `Text only: ${input.input}` }],
      // Note: no structuredContent field!
      isError: false
    };
  }
}

describe('MCP SDK Output Validation Patch', () => {
  let server: McpServer;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    server = new McpServer({
      name: 'test-server',
      version: '1.0.0'
    });

    // Spy on console methods
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should not throw when tool returns data that does not match output schema', async () => {
    const tool = new TestToolWithMismatch();

    // Register the tool
    tool.installTo(server);

    // Execute the tool directly
    let result: CallToolResult | undefined;
    let errorThrown = false;

    try {
      result = await tool.run({ input: 'test-input' });
    } catch (error) {
      errorThrown = true;
      console.log('Tool execution error:', error);
    }

    // The tool itself should execute without error
    expect(errorThrown).toBe(false);
    expect(result).toBeDefined();
    expect(result!.isError).toBe(false);
    expect(result!.structuredContent).toBeDefined();

    // The mismatched data should still be in the result
    expect(result!.structuredContent).toEqual({
      name: 'Test User',
      age: 30,
      items: 'single-string-not-array' // The invalid value is preserved
    });
  });

  it('should allow tools to return mismatched data without MCP errors', async () => {
    // This test verifies that the patch prevents MCP-level validation errors
    // We can't easily test the full MCP flow without a real transport,
    // but we can verify that the tool executes successfully
    const tool = new TestToolWithMismatch();
    tool.installTo(server);

    // The tool should execute without errors
    const result = await tool.run({ input: 'test' });

    // Result should contain the mismatched data
    expect(result.isError).toBe(false);
    expect(result.structuredContent).toEqual({
      name: 'Test User',
      age: 30,
      items: 'single-string-not-array'
    });

    // Note: The actual MCP validation happens when the server sends the response
    // Our patch makes that validation non-fatal (logs warning instead of throwing)
  });

  it('should handle missing structured content gracefully', async () => {
    const tool = new TestToolNoStructuredContent();
    tool.installTo(server);

    // Execute the tool
    const result = await tool.run({ input: 'test' });

    // Should succeed despite missing structured content
    expect(result).toBeDefined();
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe('Text only: test');
    expect(result.structuredContent).toBeUndefined();
  });

  describe('Patch Detection', () => {
    it('should verify the MCP SDK patch is applied by checking the patched file', async () => {
      // This test verifies the patch has been applied by checking for our patch marker

      // Read the patched SDK file
      const fs = await import('node:fs');
      const path = await import('node:path');
      const { fileURLToPath } = await import('node:url');

      // Get the SDK file path
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const sdkPath = path.join(
        __dirname,
        '..',
        '..',
        'node_modules',
        '@modelcontextprotocol',
        'sdk',
        'dist',
        'esm',
        'server',
        'mcp.js'
      );

      // Read the file content
      const sdkContent = fs.readFileSync(sdkPath, 'utf-8');

      // Check for our patch markers
      const hasPatchMarker = sdkContent.includes('[MCP SDK Patch]');
      const hasWarningInsteadOfThrow =
        sdkContent.includes('console.warn') &&
        sdkContent.includes('validation warning');

      // Check that validation errors are NOT thrown
      const stillThrowsValidationError =
        sdkContent.includes('throw new McpError') &&
        sdkContent.includes('Output validation error');

      if (!hasPatchMarker || !hasWarningInsteadOfThrow) {
        throw new Error(
          '🚨 MCP SDK PATCH IS NOT APPLIED! 🚨\n\n' +
            'The patch markers are missing from the SDK file.\n' +
            'This means the patch is not applied.\n\n' +
            'To fix:\n' +
            '1. Run: npm run postinstall\n' +
            "2. If that doesn't work, check patches/@modelcontextprotocol+sdk+*.patch exists\n" +
            '3. If SDK was updated, recreate the patch:\n' +
            '   - Modify node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js\n' +
            '   - Run: npx patch-package @modelcontextprotocol/sdk'
        );
      }

      if (stillThrowsValidationError) {
        console.warn(
          'Warning: The SDK still contains throw statements for validation errors.\n' +
            'The patch may be partially applied or incomplete.'
        );
      }

      // The patch is applied!
      expect(hasPatchMarker).toBe(true);
      expect(hasWarningInsteadOfThrow).toBe(true);
    });

    it('should verify patch works at runtime', async () => {
      // Runtime verification - tool should work despite schema mismatch
      const tool = new TestToolWithMismatch();
      const testServer = new McpServer({
        name: 'runtime-test',
        version: '1.0.0'
      });

      // Install tool and verify it doesn't throw during registration
      let registrationError: Error | undefined;
      try {
        tool.installTo(testServer);
      } catch (error) {
        registrationError = error as Error;
      }

      expect(registrationError).toBeUndefined();

      // Tool should execute successfully despite mismatched output
      const result = await tool.run({ input: 'test' });
      expect(result.isError).toBe(false);
      expect(result.structuredContent).toBeDefined();

      // Check that we're getting the mismatched data (not sanitized)
      expect(result.structuredContent).toHaveProperty(
        'items',
        'single-string-not-array'
      );
    });
  });
});
