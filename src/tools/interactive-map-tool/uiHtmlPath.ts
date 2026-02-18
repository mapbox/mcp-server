// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */
// @ts-ignore CJS build will fail with this line, but ESM needs it
const dirname = path.dirname(fileURLToPath(import.meta.url));

// From dist/{esm,commonjs}/tools/interactive-map-tool/ → dist/ui/interactive-map.html
export const UI_HTML_PATH = path.resolve(
  dirname,
  '..',
  '..',
  '..',
  'ui',
  'interactive-map.html'
);
