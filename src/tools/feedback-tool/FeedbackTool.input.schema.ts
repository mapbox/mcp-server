// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';
import { coordinateSchema } from '../../schemas/shared.js';

/**
 * The Feedback Agent's default categories that a chat user can report on.
 * Leaves out the ones that only make sense inside a navigation app (voice
 * guidance, banners, rerouting, puck positioning, arrival, speed traps) and
 * `non_feedback`. `routing_issue` is the general routing category the
 * Feedback API docs use in their examples.
 * Docs: https://docs.mapbox.com/ios/navigation/v2/guides/feedback-agent/#default-categories
 * and https://docs.mapbox.com/api/feedback/
 */
export const FEEDBACK_CATEGORIES = [
  'poi_closed',
  'poi_details',
  'poi_location',
  'poi_missing',
  'map_data_issue',
  'map_rendering_issue',
  'routing_issue',
  'poor_routing_issue',
  'alternative_route_issue',
  'no_route',
  'illegal_turn',
  'illegal_entrance',
  'missing_expected_maneuver',
  'eta_issue',
  'road_closure_issue',
  'road_incident_issue',
  'speed_limit_issue',
  'traffic_issue',
  'false_negative_traffic_issue',
  'false_positive_traffic_issue',
  'application_issue'
] as const;

export const FeedbackInputSchema = z.object({
  feedback: z
    .string()
    .trim()
    .min(1, 'Feedback text is required.')
    .max(2000, 'Feedback text must be 2000 characters or fewer.')
    .describe(
      "What is wrong, in the user's own words, plus what it should be if they said. " +
        'Name the place or road. Example: "Blue Bottle Coffee at 66 Mint St has closed permanently."'
    ),
  category: z
    .enum(FEEDBACK_CATEGORIES)
    .describe(
      'The kind of problem:\n' +
        '- poi_closed: the place no longer exists\n' +
        '- poi_details: wrong name, hours, phone, website or other details\n' +
        '- poi_location: the place is on the wrong spot\n' +
        '- poi_missing: a place, address or business could not be found\n' +
        '- map_data_issue / map_rendering_issue: wrong map features, or the map draws wrong\n' +
        '- routing_issue: something else wrong with a route\n' +
        '- poor_routing_issue / alternative_route_issue / no_route: a bad, missing or no route\n' +
        '- illegal_turn / illegal_entrance / missing_expected_maneuver: a turn or entrance the route got wrong\n' +
        '- eta_issue: the travel time was wrong\n' +
        '- road_closure_issue / road_incident_issue / speed_limit_issue: road data\n' +
        '- traffic_issue / false_negative_traffic_issue / false_positive_traffic_issue: traffic shown wrong (missed congestion, or congestion that is not there)\n' +
        '- application_issue: anything about the app itself rather than the map data, such as a bug, a confusing screen or a suggestion'
    ),
  coordinates: coordinateSchema.describe(
    'Where the feedback is about: the place or the spot on the route, usually taken from an earlier search or directions result. For feedback about the app itself, the place the user was looking at. Do not guess.'
  ),
  send_anyway: z
    .boolean()
    .optional()
    .describe(
      'Skip the check for an earlier report from this account. Set it only after the tool said a report already exists and the user says theirs is about a different problem.'
    )
});

export type FeedbackInput = z.infer<typeof FeedbackInputSchema>;
