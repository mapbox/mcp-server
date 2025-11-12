// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

export const ResourceReaderToolOutputSchema = z.object({
  uri: z.string().describe('The URI that was read'),
  mimeType: z.string().optional().describe('MIME type of the content'),
  text: z.string().optional().describe('Text content of the resource'),
  blob: z.string().optional().describe('Base64-encoded blob content')
});

export type ResourceReaderToolOutput = z.infer<
  typeof ResourceReaderToolOutputSchema
>;
