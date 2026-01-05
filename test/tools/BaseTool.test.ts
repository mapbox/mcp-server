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
});
