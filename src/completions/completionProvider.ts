// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { getPromptByName } from '../prompts/promptRegistry.js';
import { MAPBOX_CATEGORIES } from '../constants/categories.js';

/**
 * Completion result matching the MCP CompleteResult.completion shape.
 */
export interface CompletionResult {
  values: string[];
  total?: number;
  hasMore?: boolean;
}

const MAX_COMPLETION_VALUES = 100;

/**
 * Mapbox Directions API routing profiles.
 */
export const TRANSPORT_MODES = [
  'driving',
  'driving-traffic',
  'walking',
  'cycling'
] as const;

// Re-export for convenience
export { MAPBOX_CATEGORIES } from '../constants/categories.js';

/**
 * Map of prompt argument names to their completion source arrays.
 */
const PROMPT_ARG_COMPLETIONS: Record<string, readonly string[]> = {
  category: MAPBOX_CATEGORIES,
  mode: TRANSPORT_MODES
};

/**
 * Filter values by case-insensitive prefix and cap at MAX_COMPLETION_VALUES.
 */
function filterValues(
  values: readonly string[],
  prefix: string
): CompletionResult {
  const lowerPrefix = prefix.toLowerCase();
  const matched = lowerPrefix
    ? values.filter((v) => v.toLowerCase().startsWith(lowerPrefix))
    : [...values];

  if (matched.length <= MAX_COMPLETION_VALUES) {
    return { values: matched };
  }

  return {
    values: matched.slice(0, MAX_COMPLETION_VALUES),
    total: matched.length,
    hasMore: true
  };
}

const EMPTY_RESULT: CompletionResult = { values: [] };

/**
 * Complete a prompt argument value.
 *
 * @param promptName - The prompt name (e.g., "find-places-nearby")
 * @param argumentName - The argument being completed (e.g., "category")
 * @param value - The partial value typed so far
 */
export function completePromptArgument(
  promptName: string,
  argumentName: string,
  value: string
): CompletionResult {
  const prompt = getPromptByName(promptName);
  if (!prompt) {
    return EMPTY_RESULT;
  }

  // Verify the argument exists on this prompt
  const hasArg = prompt.arguments.some((arg) => arg.name === argumentName);
  if (!hasArg) {
    return EMPTY_RESULT;
  }

  const source = PROMPT_ARG_COMPLETIONS[argumentName];
  if (!source) {
    return EMPTY_RESULT;
  }

  return filterValues(source, value);
}
