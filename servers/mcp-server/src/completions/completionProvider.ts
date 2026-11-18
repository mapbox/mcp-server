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
 * Levenshtein distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);

  for (let i = 1; i <= m; i++) {
    let prev = i - 1;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] =
        a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }

  return dp[n];
}

/**
 * Filter values by prefix match first, then fuzzy match to fill remaining slots.
 * Results are sorted: prefix matches first, then fuzzy matches by edit distance.
 */
function filterValues(
  values: readonly string[],
  query: string
): CompletionResult {
  if (!query) {
    const all = [...values];
    if (all.length <= MAX_COMPLETION_VALUES) {
      return { values: all };
    }
    return {
      values: all.slice(0, MAX_COMPLETION_VALUES),
      total: all.length,
      hasMore: true
    };
  }

  const lowerQuery = query.toLowerCase();

  // Phase 1: prefix matches
  const prefixMatches: string[] = [];
  // Phase 2: fuzzy candidates (non-prefix matches within edit distance threshold)
  const fuzzyMatches: Array<{ value: string; distance: number }> = [];

  // Allow ~1 typo per 4 chars, minimum 1, maximum 3
  const maxDistance = Math.min(
    3,
    Math.max(1, Math.floor(lowerQuery.length / 4))
  );

  for (const v of values) {
    const lowerV = v.toLowerCase();
    if (lowerV.startsWith(lowerQuery)) {
      prefixMatches.push(v);
    } else {
      // Only compute Levenshtein if prefix didn't match and query is long enough
      if (lowerQuery.length >= 3) {
        // Compare against the same-length prefix of the candidate for substring-like matching
        const compareLen = Math.min(lowerQuery.length, lowerV.length);
        const distance = levenshtein(
          lowerQuery.slice(0, compareLen),
          lowerV.slice(0, compareLen)
        );
        if (distance <= maxDistance) {
          fuzzyMatches.push({ value: v, distance });
        }
      }
    }
  }

  // Sort fuzzy matches by distance, then alphabetically
  fuzzyMatches.sort(
    (a, b) => a.distance - b.distance || a.value.localeCompare(b.value)
  );

  const combined = [...prefixMatches, ...fuzzyMatches.map((m) => m.value)];

  if (combined.length <= MAX_COMPLETION_VALUES) {
    return { values: combined };
  }

  return {
    values: combined.slice(0, MAX_COMPLETION_VALUES),
    total: combined.length,
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
