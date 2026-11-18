// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

// Schema for the simplified output that the tool actually returns
// Just an array of category ID strings
export const CategoryListResponseSchema = z.object({
  listItems: z.array(z.string())
});

export type CategoryListResponse = z.infer<typeof CategoryListResponseSchema>;
