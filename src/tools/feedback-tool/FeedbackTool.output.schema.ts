// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

/**
 * The feedback item the Feedback API returns after a POST.
 * Docs: https://docs.mapbox.com/api/feedback/#the-feedback-item-object
 */
export const FeedbackOutputSchema = z
  .object({
    id: z.string(),
    status: z
      .string()
      .describe(
        'received (new, awaiting review), fixed, reviewed or out_of_scope. The API may add more.'
      ),
    category: z.string(),
    feedback: z.string(),
    location: z
      .object({
        place_name: z.string().optional(),
        lon: z.number(),
        lat: z.number()
      })
      .passthrough()
      .optional(),
    trace_id: z.string().optional(),
    received_at: z.string().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    duplicate: z
      .boolean()
      .optional()
      .describe(
        'True when nothing was sent because this account already has a matching report awaiting review; the fields describe that earlier report.'
      )
  })
  .passthrough();

export type FeedbackOutput = z.infer<typeof FeedbackOutputSchema>;
