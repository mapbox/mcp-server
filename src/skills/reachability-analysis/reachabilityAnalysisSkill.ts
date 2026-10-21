// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { Skill } from '../Skill.js';

export const reachabilityAnalysisSkill: Skill = {
  name: 'mapbox-reachability-analysis',
  description:
    'Find places of a kind within a travel time or distance of a location (coffee within a 10 minute walk, hospitals within 20 minutes by car) and map them with the reachable area. Also fits site selection and coverage questions.',
  tools: [
    'isochrone_tool',
    'bbox_tool',
    'category_search_tool',
    'points_within_polygon_tool',
    'render_map_tool'
  ],
  instructions: `# Places within reach

Answers questions like "what's within a 10 minute walk of my hotel?" with the
area a person can actually reach, not a straight-line radius. Rivers, highways
and one-way streets make the two very different.

## Steps

1. **Get the origin.** If you only have an address or a name, look it up with
   \`search_and_geocode_tool\` first.

2. **Compute the reachable area** with \`isochrone_tool\`:
   - \`profile\`: \`mapbox/walking\`, \`mapbox/cycling\`, \`mapbox/driving\` or
     \`mapbox/driving-traffic\`.
   - \`contours_minutes\` (1 to 60) or \`contours_meters\`. One contour is
     usually enough.
   - \`polygons: true\`, so the result is an area you can test points against.
   - \`generalize\` keeps the polygon small: about 100 meters for a short walk,
     2000 for a drive.

   Keep the result's \`mapboxRender.ref\` for the map. The polygon is the
   feature's \`geometry.coordinates\`. If the result is too large to include
   the polygon, call it again with a larger \`generalize\`.

3. **Bound the search.** Pass the polygon to \`bbox_tool\`. It returns
   \`[minLon, minLat, maxLon, maxLat]\`.

4. **Search inside the box** with \`category_search_tool\`:
   - \`category\`: a canonical category such as \`cafe\`, \`restaurant\`,
     \`pharmacy\` or \`hospital\` (the \`mapbox://categories\` resource has the
     full list).
   - \`bbox\`: \`{ minLongitude, minLatitude, maxLongitude, maxLatitude }\`
     from step 3.
   - \`proximity\`: the origin, so the closest places come first.
   - \`limit: 25\`, the most it returns.

5. **Drop places outside the area.** The box is a rectangle and the area isn't,
   so some results fall in its corners. Pass every result's coordinates with
   the polygon to \`points_within_polygon_tool\` and keep only the points it
   returns.

6. **Show it.** Call \`render_map_tool\` with the isochrone ref in
   \`payload_refs\` and one marker per place you kept, with \`id\` set to its
   Mapbox ID and \`name\` to its name. Don't pass the search ref: it would also
   show the places you dropped.

## Answering

- Say how many places are within reach, then list them nearest first.
- Name the mode and time ("a 10 minute walk"), since the area depends on both.
- If all 25 results are inside the area, there are probably more. Say so, and
  offer a narrower category or a shorter time.
- If nothing is inside, say that plainly and offer a longer time or another
  mode of travel.
- For exact travel times to each place, call \`matrix_tool\` with the origin
  first in \`coordinates\` and \`sources: "0"\`. One call covers every place.
`
};
