// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { Skill } from '../Skill.js';

export const mapDisplaySkill: Skill = {
  name: 'mapbox-map-display',
  description:
    'Show Mapbox tool results on an interactive map with render_map_tool. Covers passing refs, combining several results on one map, hand-placed markers, and when a static image is the right call instead.',
  tools: ['render_map_tool'],
  instructions: `# Showing results on a Mapbox map

Use \`render_map_tool\` whenever the user wants to see something on a map. It
renders a live, interactive Mapbox GL JS map inline in the conversation.

## Pass refs, not geometry

Every geo tool (search, directions, isochrone, elevation and so on) returns
\`structuredContent.mapboxRender.ref\`. Pass it to \`render_map_tool\` unchanged:

\`\`\`json
{ "payload_refs": ["<ref from the tool result>"] }
\`\`\`

- Never write, edit or shorten a ref. Copy it exactly.
- Don't copy coordinates out of a tool result into \`layers\` or \`markers\`
  when a ref exists. The ref keeps thousands of coordinates out of the
  conversation and the map fetches the data itself.
- The camera fits all the data on its own. Only set \`camera\` when the user
  asks for a particular view.

## Several results on one map

Put every ref in the same call to answer one question on one map, for example
a route plus places along it, or a drive-time area plus the places inside it:

\`\`\`json
{ "payload_refs": ["<isochrone ref>", "<search ref>"], "summary": "Coffee within a 10 min walk" }
\`\`\`

\`summary\` is the short chip in the map's top-left corner. Keep it under about
40 characters.

## Hand-placed markers

Use \`markers\` only for points no tool returned a ref for, or for a filtered
subset of a result (see the mapbox-reachability-analysis skill).

- For a place from a search tool, set \`id\` to its \`mapbox_id\` and \`name\` to
  its name (\`category\` and \`distanceMeters\` are optional). The map then lists
  it in its results panel with a photo and popularity when Mapbox has them,
  the same as a search ref would.
- \`style\` is \`pin\` (default), \`numbered\` (with \`label\`, e.g. visit order),
  \`start\` or \`end\`.
- Coordinates are \`[longitude, latitude]\`.

## Restyling the base map

- \`baseMapConfig: { "lightPreset": "night" }\` (also \`dawn\`, \`dusk\`) for
  lighting.
- \`baseStyle: "standard-satellite"\` for imagery.
- Only restyle when the user asks, or when it clearly helps (night lighting for
  a question about the evening).

## Static images

Use \`static_map_image_tool\` only when the user explicitly asks for an image
file (PNG or JPEG), for example to paste into a document or email. It is never
the default way to show a map.
`
};
