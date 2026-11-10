// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';
import { coordinateSchema } from '../../schemas/shared.js';

export const REPORT_CATEGORIES = [
  'bug',
  'wrong_result',
  'data_quality',
  'feature_request',
  'other'
] as const;

export const ReportInputSchema = z.object({
  feedback: z
    .string()
    .trim()
    .min(1, 'Feedback text is required.')
    .max(2000, 'Feedback text must be 2000 characters or fewer.')
    .describe(
      "What happened or what the user wants, in the user's own words. For a bug or wrong result, " +
        'say what was asked, what came back and what was expected. ' +
        'Example: "search_and_geocode_tool returned a Blue Bottle in Oakland when I asked for the one on Mint St in San Francisco."'
    ),
  category: z
    .enum(REPORT_CATEGORIES)
    .describe(
      'The kind of feedback:\n' +
        '- bug: a tool failed, errored or the map did not draw\n' +
        '- wrong_result: a tool worked but gave a wrong, confusing or unhelpful answer\n' +
        '- data_quality: wrong or missing Mapbox data, such as a closed place, wrong address or bad route\n' +
        '- feature_request: something the user wishes the server could do\n' +
        '- other: anything else'
    ),
  tool_name: z
    .string()
    .optional()
    .describe(
      'The tool the feedback is about, if any, for example directions_tool.'
    ),
  coordinates: coordinateSchema
    .optional()
    .describe(
      'Where the problem is, for data_quality feedback about a place or road, taken from an earlier result. Leave out otherwise.'
    )
});

export type ReportInput = z.infer<typeof ReportInputSchema>;
