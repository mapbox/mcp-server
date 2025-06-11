process.env.MAPBOX_ACCESS_TOKEN = 'test-token';

import { z } from 'zod';
import { MapboxApiBasedTool } from './MapboxApiBasedTool';

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
  const originalEnv = process.env;

  beforeEach(() => {
    testTool = new TestTool();
    // Mock the log method to test that errors are properly logged
    testTool['log'] = jest.fn();
  });

  afterEach(() => {
    // Restore the process.env to its original state
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  describe('error handling', () => {
    it('returns generic error message when VERBOSE_ERRORS is not set to true', async () => {
      // Make sure VERBOSE_ERRORS is not set to true
      delete process.env.VERBOSE_ERRORS;

      const result = await testTool.run({ testParam: 'test' });

      // Verify the response contains the generic error message
      expect(result.is_error).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: 'Internal error has occurred.'
      });

      // Verify the error was logged with the actual error message
      expect(testTool['log']).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('Test error message')
      );
    });

    it('returns actual error message when VERBOSE_ERRORS=true', async () => {
      // Set VERBOSE_ERRORS to true
      process.env.VERBOSE_ERRORS = 'true';

      const result = await testTool.run({ testParam: 'test' });

      // Verify the response contains the actual error message
      expect(result.is_error).toBe(true);
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

    it('returns generic error message when VERBOSE_ERRORS is set to a value other than true', async () => {
      // Set VERBOSE_ERRORS to something other than 'true'
      process.env.VERBOSE_ERRORS = 'yes';

      const result = await testTool.run({ testParam: 'test' });

      // Verify the response contains the generic error message
      expect(result.is_error).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: 'Internal error has occurred.'
      });

      // Verify the error was logged with the actual error message
      expect(testTool['log']).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('Test error message')
      );
    });

    it('handles non-Error objects thrown', async () => {
      // Override the execute method to throw a string instead of an Error
      testTool['execute'] = jest.fn().mockImplementation(() => {
        throw 'String error message';
      });

      process.env.VERBOSE_ERRORS = 'true';

      const result = await testTool.run({ testParam: 'test' });

      // Verify the response contains the string error
      expect(result.is_error).toBe(true);
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
