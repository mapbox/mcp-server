// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';
import { languageSchema } from '../../schemas/shared.js';

export const CategoryListInputSchema = z.object({
  language: languageSchema.optional(),
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe(
      'Number of categories to return (1-100). WARNING: Only use this parameter if you need to optimize token usage. If using pagination, please make multiple calls to retrieve all categories before proceeding with other tasks. If not specified, returns all categories.'
    ),
  offset: z
    .number()
    .min(0)
    .optional()
    .default(0)
    .describe('Number of categories to skip for pagination. Default is 0.')
});

export type CategoryListInput = z.infer<typeof CategoryListInputSchema>;
