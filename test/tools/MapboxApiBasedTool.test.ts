// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { MapboxApiBasedTool } from '../../src/tools/MapboxApiBasedTool.js';
import type { HttpRequest } from '../../src/utils/types.js';
import { setupHttpRequest } from '../utils/httpPipelineUtils.js';

// Create a minimal implementation of MapboxApiBasedTool for testing
class TestTool extends MapboxApiBasedTool<typeof TestTool.inputSchema> {
  static readonly annotations = {
    title: 'Test Tool for MapboxApiBasedTool',
    readOnlyHint: true,
    idempotentHint: true
  };

  readonly annotations = TestTool.annotations;
  readonly name = 'test-tool';
  readonly description = 'Tool for testing MapboxApiBasedTool error handling';

  static readonly inputSchema = z.object({
    testParam: z.string()
  });

  constructor(params: { httpRequest: HttpRequest }) {
    super({
      inputSchema: TestTool.inputSchema,
      httpRequest: params.httpRequest
    });
  }

  protected async execute(
    _input: z.infer<typeof TestTool.inputSchema>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    throw new Error('Test error message');
  }
}

describe('MapboxApiBasedTool', () => {
  let testTool: TestTool;

  beforeEach(() => {
    vi.stubEnv(
      'MAPBOX_ACCESS_TOKEN',
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature'
    );

    const { httpRequest } = setupHttpRequest();
    testTool = new TestTool({ httpRequest });
    // Mock the log method to test that errors are properly logged
    testTool['log'] = vi.fn();
  });

  afterEach(() => {
    // Restore the process.env to its original state
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe('JWT token validation', () => {
    it('throws an error when the token is not in a valid JWT format', async () => {
      // Test the private isValidJwtFormat method directly
      const spy = vi
        .spyOn(MapboxApiBasedTool, 'mapboxAccessToken', 'get')
        .mockReturnValue('invalid-token-format');

      try {
        // Create a new instance with the modified token
        const { httpRequest } = setupHttpRequest();
        const toolWithInvalidToken = new TestTool({ httpRequest });
        // Mock the log method separately for this instance
        toolWithInvalidToken['log'] = vi.fn();

        // Try to call the run method, it should throw an error due to invalid JWT format
        const result = await toolWithInvalidToken.run({ testParam: 'test' });

        // Verify the error response
        expect(result.isError).toBe(true);

        // Check for error message content
        expect(
          (result.content[0] as { type: 'text'; text: string }).text
        ).toContain('not in valid JWT format');

        // Verify the error was logged
        expect(toolWithInvalidToken['log']).toHaveBeenCalledWith(
          'error',
          expect.stringMatching(/.*not in valid JWT format.*/)
        );
      } finally {
        spy.mockRestore();
      }
    });

    it('accepts a token with valid JWT format', async () => {
      // Set a valid JWT format token (header.payload.signature)
      process.env.MAPBOX_ACCESS_TOKEN =
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

      // Override execute to return a success result instead of throwing an error
      testTool['execute'] = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ success: true }) }],
        isError: false
      });

      const result = await testTool.run({ testParam: 'test' });

      // The token validation should pass, and we should get the success result
      expect(result.isError).toBe(false);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(
        JSON.parse((result.content[0] as { type: 'text'; text: string }).text)
      ).toEqual({ success: true });
    });
  });

  describe('error handling', () => {
    it('returns actual error message', async () => {
      const result = await testTool.run({ testParam: 'test' });

      const errorResponse = {
        message: 'Test error message',
        tool: 'test-tool'
      };

      // Verify the response contains the actual error message
      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: JSON.stringify(errorResponse)
      });

      // Verify the error was logged with the actual error message
      expect(testTool['log']).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('Test error message')
      );
    });

    it('handles non-Error objects thrown', async () => {
      // Override the execute method to throw a string instead of an Error
      testTool['execute'] = vi.fn().mockImplementation(() => {
        throw 'String error message';
      });

      const errorResponse = {
        message: 'String error message',
        tool: 'test-tool'
      };

      const result = await testTool.run({ testParam: 'test' });

      // Verify the response contains the string error
      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: JSON.stringify(errorResponse)
      });

      // Verify the error was logged
      expect(testTool['log']).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('String error message')
      );
    });
  });
});
