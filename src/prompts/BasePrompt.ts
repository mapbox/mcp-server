// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import {
  type Prompt,
  type PromptArgument,
  type PromptMessage
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Base class for all MCP prompts.
 *
 * Prompts are pre-built, parameterized workflows that guide multi-step geospatial tasks.
 * They capture domain expertise and best practices for common use cases.
 */
export abstract class BasePrompt {
  /**
   * Unique identifier for this prompt (e.g., "find-places-nearby")
   */
  abstract readonly name: string;

  /**
   * Human-readable description of what this prompt does
   */
  abstract readonly description: string;

  /**
   * Arguments this prompt accepts
   */
  abstract readonly arguments: PromptArgument[];

  /**
   * Get the prompt metadata for listing
   */
  getMetadata(): Prompt {
    return {
      name: this.name,
      description: this.description,
      arguments: this.arguments
    };
  }

  /**
   * Generate the prompt messages with filled-in arguments
   *
   * @param args - The argument values provided by the user/agent
   * @returns Array of messages to send to the LLM
   */
  abstract getMessages(args: Record<string, string>): PromptMessage[];

  /**
   * Validate that all required arguments are provided
   *
   * @param args - The argument values to validate
   * @throws Error if required arguments are missing
   */
  protected validateArguments(args: Record<string, string>): void {
    for (const arg of this.arguments) {
      if (arg.required && !args[arg.name]) {
        throw new Error(`Missing required argument: ${arg.name}`);
      }
    }
  }
}
