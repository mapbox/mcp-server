import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { MapboxApiBasedTool } from '../../src/tools/MapboxApiBasedTool.js';

// Create a minimal implementation of MapboxApiBasedTool for testing
class TestTool extends MapboxApiBasedTool<typeof TestTool.inputSchema> {
  readonly name = 'test-tool';
  readonly description = 'Tool for testing MapboxApiBasedTool error handling';

  static readonly inputSchema = z.object({
    testParam: z.string()
  });

  constructor() {
    super({ inputSchema: TestTool.inputSchema });
  }

  protected async execute(
    _input: z.infer<typeof TestTool.inputSchema>
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

    testTool = new TestTool();
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
      const originalToken = MapboxApiBasedTool.MAPBOX_ACCESS_TOKEN;

      try {
        // Temporarily modify the static property for testing
        Object.defineProperty(MapboxApiBasedTool, 'MAPBOX_ACCESS_TOKEN', {
          value: 'invalid-token-format',
          writable: true,
          configurable: true
        });

        // Create a new instance with the modified token
        const toolWithInvalidToken = new TestTool();
        // Mock the log method separately for this instance
        toolWithInvalidToken['log'] = vi.fn();

        // Try to call the run method, it should throw an error due to invalid JWT format
        const result = await toolWithInvalidToken.run({ testParam: 'test' });

        // Verify the error response
        expect(result.isError).toBe(true);

        // Check for error message content
        if (process.env.VERBOSE_ERRORS === 'true') {
          expect(
            (result.content[0] as { type: 'text'; text: string }).text
          ).toContain('not in valid JWT format');
        }

        // Verify the error was logged
        expect(toolWithInvalidToken['log']).toHaveBeenCalledWith(
          'error',
          expect.stringMatching(/.*not in valid JWT format.*/)
        );
      } finally {
        // Restore the original value
        Object.defineProperty(MapboxApiBasedTool, 'MAPBOX_ACCESS_TOKEN', {
          value: originalToken,
          writable: true,
          configurable: true
        });
      }
    });

    it('accepts a token with valid JWT format', async () => {
      // Set a valid JWT format token (header.payload.signature)
      process.env.MAPBOX_ACCESS_TOKEN =
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

      // Override execute to return a success result instead of throwing an error
      testTool['execute'] = vi.fn().mockResolvedValue({ success: true });

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

      // Verify the response contains the actual error message
      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: 'Test error message'
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

      const result = await testTool.run({ testParam: 'test' });

      // Verify the response contains the string error
      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: 'String error message'
      });

      // Verify the error was logged
      expect(testTool['log']).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('String error message')
      );
    });
  });
});
