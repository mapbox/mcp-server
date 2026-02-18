// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import path from 'node:path';

// From dist/{esm,commonjs}/tools/interactive-map-tool/ → dist/ui/interactive-map.html
export const UI_HTML_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'ui',
  'interactive-map.html'
);
