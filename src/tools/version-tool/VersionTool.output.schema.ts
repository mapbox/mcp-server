// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

// Schema for version tool output - matches the VersionInfo interface
export const VersionResponseSchema = z.object({
  name: z.string(),
  version: z.string(),
  sha: z.string(),
  tag: z.string(),
  branch: z.string()
});

export type VersionResponse = z.infer<typeof VersionResponseSchema>;
