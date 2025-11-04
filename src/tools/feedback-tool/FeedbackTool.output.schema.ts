// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

/**
 * Location object schema for feedback items
 */
const FeedbackLocationSchema = z.object({
  place_name: z.string().optional(),
  lon: z.number(),
  lat: z.number()
});

/**
 * Feedback item schema
 */
export const FeedbackItemSchema = z.object({
  id: z.string().uuid(),
  status: z
    .string()
    .describe(
      'The status of the feedback item. Known statuses: received (initial status, awaiting review), fixed (addressed by Mapbox), reviewed (reviewed for future improvements), out_of_scope (outside Mapbox support or flagged as spam). The API may return additional statuses in the future.'
    ),
  category: z.string(),
  feedback: z.string(),
  location: FeedbackLocationSchema,
  trace_id: z.string().optional(),
  received_at: z.string(), // ISO 8601 timestamp
  created_at: z.string(), // ISO 8601 timestamp
  updated_at: z.string() // ISO 8601 timestamp
});

/**
 * Response schema for list operation
 */
export const FeedbackListResponseSchema = z.object({
  items: z.array(FeedbackItemSchema),
  has_before: z.boolean(),
  start_cursor: z.string(),
  has_after: z.boolean(),
  end_cursor: z.string()
});

/**
 * Response schema for get operation (single item)
 */
export const FeedbackGetResponseSchema = FeedbackItemSchema;

/**
 * Union schema for both list and get responses
 */
export const FeedbackResponseSchema = z.union([
  FeedbackListResponseSchema,
  FeedbackGetResponseSchema
]);

export type FeedbackItem = z.infer<typeof FeedbackItemSchema>;
export type FeedbackLocation = z.infer<typeof FeedbackLocationSchema>;
export type FeedbackListResponse = z.infer<typeof FeedbackListResponseSchema>;
export type FeedbackGetResponse = z.infer<typeof FeedbackGetResponseSchema>;
export type FeedbackResponse = z.infer<typeof FeedbackResponseSchema>;
