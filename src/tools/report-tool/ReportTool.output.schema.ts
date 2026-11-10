// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

/**
 * The feedback item the report endpoint returns after a POST. It is the
 * Feedback API's item, filed under Mapbox's account.
 * Docs: https://docs.mapbox.com/api/feedback/#the-feedback-item-object
 */
export const ReportOutputSchema = z
  .object({
    id: z.string(),
    status: z.string().optional(),
    category: z.string(),
    feedback: z.string()
  })
  .passthrough();

export type ReportOutput = z.infer<typeof ReportOutputSchema>;
