// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

/**
 * Input schema for Feedback Get Tool
 */
export const FeedbackGetInputSchema = z.object({
  feedback_id: z
    .string()
    .uuid()
    .describe('The unique identifier of the feedback item'),
  format: z
    .enum(['json_string', 'formatted_text'])
    .optional()
    .default('formatted_text')
    .describe(
      'Output format: "json_string" returns raw JSON data as a JSON string that can be parsed; "formatted_text" returns human-readable text. Both return as text content but json_string contains parseable JSON data while formatted_text is for display.'
    )
});

export type FeedbackGetInput = z.infer<typeof FeedbackGetInputSchema>;
