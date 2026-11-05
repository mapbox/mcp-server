// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { Icon } from '@modelcontextprotocol/server';

// The Mapbox mark from the server icon, cropped square: the wide logo
// is unreadable at sidebar size.
const MAPBOX_MARK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="4 0 180 180" fill="#4264fb">' +
  '<path d="M93.9,1.1C44.8,1.1,5,40.9,5,90s39.8,88.9,88.9,88.9s88.9-39.8,88.9-88.9C182.8,40.9,143,1.1,93.9,1.1z M136.1,111.8c-30.4,30.4-84.7,20.7-84.7,20.7s-9.8-54.2,20.7-84.7C89,30.9,117,31.6,134.7,49.2S153,94.9,136.1,111.8L136.1,111.8z"/>' +
  '<polygon points="104.1,53.2 95.4,71.1 77.5,79.8 95.4,88.5 104.1,106.4 112.8,88.5 130.7,79.8 112.8,71.1"/>' +
  '</svg>';

/** Square Mapbox icon for sidebar entrypoints. */
export const mapboxMarkIcon: Icon = {
  src: `data:image/svg+xml;base64,${Buffer.from(MAPBOX_MARK_SVG).toString('base64')}`,
  mimeType: 'image/svg+xml',
  sizes: ['any']
};
