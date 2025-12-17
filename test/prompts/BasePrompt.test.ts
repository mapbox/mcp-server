// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, test, expect, beforeEach } from 'vitest';
import { BasePrompt } from '../../src/prompts/BasePrompt.js';
import type {
  PromptArgument,
  PromptMessage
} from '@modelcontextprotocol/sdk/types.js';

// Create a concrete test implementation of BasePrompt
class TestPrompt extends BasePrompt {
  readonly name = 'test-prompt';
  readonly description = 'A test prompt for unit testing';
  readonly arguments: PromptArgument[] = [
    {
      name: 'required_arg',
      description: 'A required argument',
      required: true
    },
    {
      name: 'optional_arg',
      description: 'An optional argument',
      required: false
    }
  ];

  getMessages(args: Record<string, string>): PromptMessage[] {
    this.validateArguments(args);

    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Test message with required: ${args.required_arg}, optional: ${args.optional_arg || 'not provided'}`
        }
      }
    ];
  }
}

describe('BasePrompt', () => {
  let prompt: TestPrompt;

  beforeEach(() => {
    prompt = new TestPrompt();
  });

  describe('getMetadata', () => {
    test('returns correct metadata structure', () => {
      const metadata = prompt.getMetadata();

      expect(metadata.name).toBe('test-prompt');
      expect(metadata.description).toBe('A test prompt for unit testing');
      expect(metadata.arguments).toBeDefined();
      expect(Array.isArray(metadata.arguments)).toBe(true);
      expect(metadata.arguments?.length).toBe(2);
    });

    test('metadata includes all argument definitions', () => {
      const metadata = prompt.getMetadata();

      const argNames = metadata.arguments?.map((a) => a.name) || [];
      expect(argNames).toContain('required_arg');
      expect(argNames).toContain('optional_arg');
    });

    test('metadata preserves argument required flags', () => {
      const metadata = prompt.getMetadata();

      const requiredArg = metadata.arguments?.find(
        (a) => a.name === 'required_arg'
      );
      expect(requiredArg?.required).toBe(true);

      const optionalArg = metadata.arguments?.find(
        (a) => a.name === 'optional_arg'
      );
      expect(optionalArg?.required).toBe(false);
    });
  });

  describe('validateArguments', () => {
    test('accepts valid arguments with all fields', () => {
      const args = {
        required_arg: 'value1',
        optional_arg: 'value2'
      };

      expect(() => prompt.validateArguments(args)).not.toThrow();
    });

    test('accepts valid arguments with only required fields', () => {
      const args = {
        required_arg: 'value1'
      };

      expect(() => prompt.validateArguments(args)).not.toThrow();
    });

    test('throws error when required argument is missing', () => {
      const args = {
        optional_arg: 'value2'
      };

      expect(() => prompt.validateArguments(args)).toThrow(
        'Missing required argument: required_arg'
      );
    });

    test('throws error when required argument is empty string', () => {
      const args = {
        required_arg: '',
        optional_arg: 'value2'
      };

      expect(() => prompt.validateArguments(args)).toThrow(
        'Missing required argument: required_arg'
      );
    });

    test('accepts whitespace-only arguments (no trimming performed)', () => {
      const args = {
        required_arg: '   ',
        optional_arg: 'value2'
      };

      // Note: BasePrompt does not trim whitespace, so this is considered valid
      expect(() => prompt.validateArguments(args)).not.toThrow();
    });

    test('accepts empty string for optional arguments', () => {
      const args = {
        required_arg: 'value1',
        optional_arg: ''
      };

      expect(() => prompt.validateArguments(args)).not.toThrow();
    });

    test('accepts missing optional arguments', () => {
      const args = {
        required_arg: 'value1'
      };

      expect(() => prompt.validateArguments(args)).not.toThrow();
    });

    test('ignores extra arguments not in definition', () => {
      const args = {
        required_arg: 'value1',
        optional_arg: 'value2',
        extra_arg: 'should be ignored'
      };

      expect(() => prompt.validateArguments(args)).not.toThrow();
    });
  });

  describe('getMessages', () => {
    test('returns messages with correct structure', () => {
      const args = {
        required_arg: 'test_value'
      };

      const messages = prompt.getMessages(args);

      expect(Array.isArray(messages)).toBe(true);
      expect(messages.length).toBeGreaterThan(0);

      messages.forEach((message) => {
        expect(message.role).toBeDefined();
        expect(message.content).toBeDefined();
        expect(message.content.type).toBe('text');
        expect(typeof message.content.text).toBe('string');
      });
    });

    test('throws when required arguments are missing', () => {
      const args = {
        optional_arg: 'value'
      };

      expect(() => prompt.getMessages(args)).toThrow(
        'Missing required argument: required_arg'
      );
    });

    test('includes argument values in generated messages', () => {
      const args = {
        required_arg: 'test_required',
        optional_arg: 'test_optional'
      };

      const messages = prompt.getMessages(args);
      const messageText = messages[0].content.text;

      expect(messageText).toContain('test_required');
      expect(messageText).toContain('test_optional');
    });

    test('handles missing optional arguments gracefully', () => {
      const args = {
        required_arg: 'test_required'
      };

      const messages = prompt.getMessages(args);
      const messageText = messages[0].content.text;

      expect(messageText).toContain('test_required');
      expect(messageText).toContain('not provided');
    });
  });

  describe('edge cases', () => {
    test('validates empty args object when no arguments are required', () => {
      class NoArgsPrompt extends BasePrompt {
        readonly name = 'no-args';
        readonly description = 'No arguments needed';
        readonly arguments: PromptArgument[] = [];

        getMessages(_args: Record<string, string>): PromptMessage[] {
          return [
            {
              role: 'user',
              content: {
                type: 'text',
                text: 'No arguments needed'
              }
            }
          ];
        }
      }

      const noArgsPrompt = new NoArgsPrompt();
      expect(() => noArgsPrompt.validateArguments({})).not.toThrow();
      expect(() => noArgsPrompt.getMessages({})).not.toThrow();
    });

    test('validates all required arguments', () => {
      class MultiRequiredPrompt extends BasePrompt {
        readonly name = 'multi-required';
        readonly description = 'Multiple required arguments';
        readonly arguments: PromptArgument[] = [
          { name: 'arg1', description: 'First', required: true },
          { name: 'arg2', description: 'Second', required: true },
          { name: 'arg3', description: 'Third', required: true }
        ];

        getMessages(_args: Record<string, string>): PromptMessage[] {
          return [
            {
              role: 'user',
              content: { type: 'text', text: 'Test' }
            }
          ];
        }
      }

      const multiPrompt = new MultiRequiredPrompt();

      // Missing arg1
      expect(() =>
        multiPrompt.validateArguments({ arg2: 'val2', arg3: 'val3' })
      ).toThrow('Missing required argument: arg1');

      // Missing arg2
      expect(() =>
        multiPrompt.validateArguments({ arg1: 'val1', arg3: 'val3' })
      ).toThrow('Missing required argument: arg2');

      // Missing arg3
      expect(() =>
        multiPrompt.validateArguments({ arg1: 'val1', arg2: 'val2' })
      ).toThrow('Missing required argument: arg3');

      // All present - should not throw
      expect(() =>
        multiPrompt.validateArguments({
          arg1: 'val1',
          arg2: 'val2',
          arg3: 'val3'
        })
      ).not.toThrow();
    });
  });
});
