// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

/**
 * ISO 8601 date string validator
 */
const iso8601DateSchema = () =>
  z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/,
      'Must be in ISO 8601 format: YYYY-MM-DDTHH:mm:ss.SSSZ'
    );

/**
 * Feedback status enum
 */
export const feedbackStatusSchema = z.enum([
  'received',
  'fixed',
  'reviewed',
  'out_of_scope'
]);

/**
 * Input schema for Feedback List Tool
 */
export const FeedbackListInputSchema = z.object({
  feedback_ids: z
    .array(z.string().uuid())
    .optional()
    .describe(
      'Filter by one or more feedback item IDs. At least one must match.'
    ),
  after: z
    .string()
    .optional()
    .describe(
      'A cursor from a previous response. Use this to fetch the next page of results.'
    ),
  limit: z
    .number()
    .min(1)
    .max(1000)
    .optional()
    .describe('The maximum number of feedback items to return (1-1000)'),
  sort_by: z
    .enum(['received_at', 'created_at', 'updated_at'])
    .optional()
    .default('received_at')
    .describe(
      'The field to sort results by. Options: received_at (default), created_at, or updated_at'
    ),
  order: z
    .enum(['asc', 'desc'])
    .optional()
    .default('asc')
    .describe(
      'The sort direction: asc (ascending, default) or desc (descending)'
    ),
  status: z
    .array(feedbackStatusSchema)
    .optional()
    .describe(
      'Filter by one or more feedback statuses. Options: received, fixed, reviewed, out_of_scope'
    ),
  category: z
    .array(z.string())
    .optional()
    .describe('Filter by one or more feedback categories'),
  search: z
    .string()
    .optional()
    .describe(
      'A search phrase. Returns items where the feedback text contains the phrase.'
    ),
  trace_id: z
    .array(z.string())
    .optional()
    .describe(
      'Filter by one or more trace_id values. At least one must match.'
    ),
  created_before: iso8601DateSchema()
    .optional()
    .describe(
      'Return items created before the specified time. Use ISO 8601 format: YYYY-MM-DDTHH:mm:ss.SSSZ'
    ),
  created_after: iso8601DateSchema()
    .optional()
    .describe(
      'Return items created after the specified time. Use ISO 8601 format: YYYY-MM-DDTHH:mm:ss.SSSZ'
    ),
  received_before: iso8601DateSchema()
    .optional()
    .describe(
      'Return items received by Mapbox before the specified time. Use ISO 8601 format: YYYY-MM-DDTHH:mm:ss.SSSZ'
    ),
  received_after: iso8601DateSchema()
    .optional()
    .describe(
      'Return items received by Mapbox after the specified time. Use ISO 8601 format: YYYY-MM-DDTHH:mm:ss.SSSZ'
    ),
  updated_before: iso8601DateSchema()
    .optional()
    .describe(
      'Return items last updated before the specified time. Use ISO 8601 format: YYYY-MM-DDTHH:mm:ss.SSSZ'
    ),
  updated_after: iso8601DateSchema()
    .optional()
    .describe(
      'Return items last updated after the specified time. Use ISO 8601 format: YYYY-MM-DDTHH:mm:ss.SSSZ'
    ),
  format: z
    .enum(['json_string', 'formatted_text'])
    .optional()
    .default('formatted_text')
    .describe(
      'Output format: "json_string" returns raw JSON data as a JSON string that can be parsed; "formatted_text" returns human-readable text. Both return as text content but json_string contains parseable JSON data while formatted_text is for display.'
    )
});

export type FeedbackListInput = z.infer<typeof FeedbackListInputSchema>;
