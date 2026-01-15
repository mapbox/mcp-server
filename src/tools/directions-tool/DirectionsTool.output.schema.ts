// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';

// GeoJSON LineString schema
const GeoJSONLineStringSchema = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(
    z
      .tuple([z.number(), z.number()])
      .or(z.tuple([z.number(), z.number(), z.number()]))
  )
});

// Time zone information schema
const TimeZoneSchema = z.object({
  identifier: z.string(),
  offset: z.string(),
  abbreviation: z.string().optional()
});

// Waypoint metadata for charging stations (EV routing)
const ChargingStationMetadataSchema = z.object({
  type: z.literal('charging-station'),
  name: z.string(),
  charge_time: z.number(),
  charge_to: z.number(),
  charge_at_arrival: z.number(),
  plug_type: z.string(),
  current_type: z.string().optional(),
  power_kw: z.number(),
  station_id: z.string(),
  provider_names: z.array(z.string()).optional()
});

// Silent waypoint metadata
const SilentMetadataSchema = z.object({
  type: z.literal('silent'),
  distance_from_route_start: z.number(),
  geometry_index: z.number()
});

// Regular waypoint metadata
const RegularMetadataSchema = z.object({
  type: z.literal('regular')
});

// Union of all waypoint metadata types
const WaypointMetadataSchema = z.union([
  ChargingStationMetadataSchema,
  SilentMetadataSchema,
  RegularMetadataSchema
]);

// Waypoint object schema
const WaypointSchema = z.object({
  name: z.string(),
  location: z.tuple([z.number(), z.number()]),
  distance: z.number().optional(),
  time_zone: TimeZoneSchema.optional(),
  metadata: WaypointMetadataSchema.nullable().optional()
});

// Admin boundary schema
const AdminSchema = z.object({
  iso_3166_1: z.string(),
  iso_3166_1_alpha3: z.string()
});

// Incident congestion schema
const IncidentCongestionSchema = z.object({
  value: z.number()
});

// Incident object schema
const IncidentSchema = z.object({
  id: z.string(),
  type: z.enum([
    'accident',
    'congestion',
    'construction',
    'disabled_vehicle',
    'lane_restriction',
    'mass_transit',
    'miscellaneous',
    'other_news',
    'planned_event',
    'road_closure',
    'road_hazard',
    'weather'
  ]),
  description: z.string(),
  long_description: z.string(),
  creation_time: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  impact: z.enum(['unknown', 'critical', 'major', 'minor', 'low']),
  lanes_blocked: z.array(z.string()),
  num_lanes_blocked: z.number(),
  congestion: IncidentCongestionSchema,
  closed: z.boolean(),
  geometry_index_start: z.number(),
  geometry_index_end: z.number(),
  sub_type: z.string().optional(),
  sub_type_description: z.string().optional(),
  iso_3166_1_alpha2: z.string(),
  iso_3166_1_alpha3: z.string(),
  affected_road_names: z.array(z.string()),
  south: z.number(),
  west: z.number(),
  north: z.number(),
  east: z.number()
});

// Maxspeed annotation schema
const MaxspeedSchema = z.object({
  speed: z.number().optional(),
  unit: z.string().optional(),
  none: z.boolean().optional(),
  unknown: z.boolean().optional()
});

// Route leg annotation schema
const AnnotationSchema = z.object({
  distance: z.array(z.number()).optional(),
  duration: z.array(z.number()).optional(),
  speed: z.array(z.number()).optional(),
  congestion: z.array(z.string()).optional(),
  congestion_numeric: z.array(z.number().nullable()).optional(),
  maxspeed: z.array(MaxspeedSchema).optional(),
  state_of_charge: z.array(z.number()).optional()
});

// Via waypoint schema
const ViaWaypointSchema = z.object({
  waypoint_index: z.number(),
  distance_from_start: z.number(),
  geometry_index: z.number()
});

// Notification details schema
const NotificationDetailsSchema = z.object({
  requested_value: z.union([z.string(), z.number()]).optional(),
  actual_value: z.union([z.string(), z.number()]).optional(),
  unit: z.string().optional(),
  message: z.string().optional()
});

// Notification object schema
const NotificationSchema = z.object({
  type: z.enum(['violation', 'alert']),
  subtype: z.string().optional(),
  refresh_type: z.enum(['static', 'dynamic']),
  geometry_index: z.number().optional(),
  geometry_index_start: z.number().optional(),
  geometry_index_end: z.number().optional(),
  station_id: z.string().optional(),
  reason: z.string().optional(),
  details: NotificationDetailsSchema.optional()
});

// Lane object schema
const LaneSchema = z.object({
  valid: z.boolean(),
  active: z.boolean().optional(),
  valid_indication: z.string().optional(),
  indications: z.array(z.string()),
  access: z
    .object({
      designated: z.array(z.string()).optional()
    })
    .optional()
});

// Rest stop schema
const RestStopSchema = z.object({
  type: z.enum(['rest_area', 'service_area']),
  name: z.string().optional()
});

// Toll collection schema
const TollCollectionSchema = z.object({
  type: z.enum(['toll_booth', 'toll_gantry']),
  name: z.string().optional()
});

// Mapbox Streets v8 schema
const MapboxStreetsV8Schema = z.object({
  class: z.string()
});

// Intersection object schema
const IntersectionSchema = z.object({
  location: z.tuple([z.number(), z.number()]),
  bearings: z.array(z.number()),
  classes: z.array(z.string()).optional(),
  entry: z.array(z.boolean()),
  geometry_index: z.number().optional(),
  in: z.number().optional(),
  out: z.number().optional(),
  lanes: z.array(LaneSchema).optional(),
  duration: z.number().optional(),
  tunnel_name: z.string().optional(),
  mapbox_streets_v8: MapboxStreetsV8Schema.optional(),
  is_urban: z.boolean().optional(),
  admin_index: z.number().optional(),
  rest_stop: RestStopSchema.optional(),
  toll_collection: TollCollectionSchema.optional(),
  railway_crossing: z.boolean().optional(),
  traffic_signal: z.boolean().optional(),
  stop_sign: z.boolean().optional(),
  yield_sign: z.boolean().optional()
});

// Step maneuver object schema
const StepManeuverSchema = z.object({
  bearing_before: z.number(),
  bearing_after: z.number(),
  instruction: z.string(),
  location: z.tuple([z.number(), z.number()]),
  modifier: z.string().optional(),
  type: z.enum([
    'turn',
    'new_name',
    'depart',
    'arrive',
    'merge',
    'on_ramp',
    'off_ramp',
    'fork',
    'end_of_road',
    'continue',
    'roundabout',
    'rotary',
    'roundabout_turn',
    'notification',
    'exit_roundabout',
    'exit_rotary'
  ]),
  exit: z.number().optional()
});

// Voice instruction object schema
const VoiceInstructionSchema = z.object({
  distanceAlongGeometry: z.number(),
  announcement: z.string(),
  ssmlAnnouncement: z.string().optional()
});

// Banner instruction component schema
const BannerComponentSchema = z.object({
  type: z.enum(['text', 'icon', 'delimiter', 'lane']),
  text: z.string(),
  abbr: z.string().optional(),
  abbr_priority: z.number().optional(),
  imageBaseURL: z.string().optional(),
  directions: z.array(z.enum(['left', 'right', 'straight'])).optional(),
  active: z.boolean().optional(),
  active_direction: z.string().optional()
});

// Banner instruction content schema
const BannerContentSchema = z.object({
  type: z.string().optional(),
  modifier: z.string().optional(),
  degrees: z.number().optional(),
  driving_side: z.enum(['left', 'right']).optional(),
  text: z.string(),
  components: z.array(BannerComponentSchema)
});

// Banner instruction object schema
const BannerInstructionSchema = z.object({
  distanceAlongGeometry: z.number(),
  primary: BannerContentSchema,
  secondary: BannerContentSchema.nullable().optional(),
  sub: BannerContentSchema.optional()
});

// Route step object schema
const RouteStepSchema = z.object({
  maneuver: StepManeuverSchema,
  distance: z.number(),
  duration: z.number(),
  weight: z.number(),
  duration_typical: z.number().nullable().optional(),
  weight_typical: z.number().nullable().optional(),
  geometry: z.union([z.string(), GeoJSONLineStringSchema]),
  name: z.string(),
  ref: z.string().optional(),
  destinations: z.string().optional(),
  exits: z.string().optional(),
  driving_side: z.enum(['left', 'right']),
  mode: z.string(),
  pronunciation: z.string().optional(),
  intersections: z.array(IntersectionSchema),
  speedLimitSign: z.enum(['mutcd', 'vienna']).optional(),
  speedLimitUnit: z.enum(['km/h', 'mph']).optional(),
  voiceInstructions: z.array(VoiceInstructionSchema).optional(),
  bannerInstructions: z.array(BannerInstructionSchema).optional(),
  rotary_name: z.string().optional(),
  rotary_pronunciation: z.string().optional(),
  exit: z.number().optional()
});

// Closure object schema
const ClosureSchema = z.object({
  geometry_index_start: z.number(),
  geometry_index_end: z.number()
});

// Route leg object schema
const RouteLegSchema = z.object({
  distance: z.number(),
  duration: z.number(),
  weight: z.number(),
  duration_typical: z.number().nullable().optional(),
  weight_typical: z.number().nullable().optional(),
  steps: z.array(RouteStepSchema),
  summary: z.string(),
  admins: z.array(AdminSchema),
  incidents: z.array(IncidentSchema).optional(),
  closures: z.array(ClosureSchema).optional(),
  annotation: AnnotationSchema.optional(),
  via_waypoints: z.array(ViaWaypointSchema).optional(),
  notifications: z.array(NotificationSchema).optional()
});

// Route object schema
const RouteSchema = z.object({
  duration: z.number(),
  distance: z.number(),
  weight_name: z.enum(['auto', 'pedestrian']).optional(), // Removed by cleanResponseData
  weight: z.number().optional(), // Removed by cleanResponseData
  duration_typical: z.number().nullable().optional(),
  weight_typical: z.number().nullable().optional(),
  geometry: z.union([z.string(), GeoJSONLineStringSchema]).optional(), // Can be removed when geometries='none'
  legs: z.array(RouteLegSchema).optional(), // Removed by cleanResponseData, replaced with leg_summaries
  voiceLocale: z.string().optional(),
  waypoints: z.array(WaypointSchema).optional(), // Present when waypoints_per_route=true
  // Fields added by cleanResponseData
  leg_summaries: z.array(z.string()).optional(),
  intersecting_admins: z.array(z.string()).optional(),
  notifications_summary: z.array(z.string()).optional(),
  incidents_summary: z.array(z.any()).optional(),
  instructions: z.array(z.string()).optional(),
  num_legs: z.number().optional(),
  congestion_information: z
    .object({
      length_low: z.number(),
      length_moderate: z.number(),
      length_heavy: z.number(),
      length_severe: z.number()
    })
    .optional(),
  average_speed_kph: z.number().optional(),
  duration_under_typical_traffic_conditions: z.number().optional()
});

// Modified waypoint schema for cleanResponseData output
const CleanedWaypointSchema = z.object({
  name: z.string(),
  snap_location: z.tuple([z.number(), z.number()]), // Renamed from location
  snap_distance: z.number().optional(), // Renamed from distance, rounded to integer
  time_zone: TimeZoneSchema.optional(),
  metadata: WaypointMetadataSchema.nullable().optional()
});

// Main Directions API response schema
export const DirectionsResponseSchema = z.object({
  routes: z.array(RouteSchema).optional(), // Can be missing if no route found
  waypoints: z.array(CleanedWaypointSchema).optional(), // Modified waypoints with renamed fields
  code: z.string().optional(), // Removed by cleanResponseData for token efficiency
  uuid: z.string().optional() // Removed by cleanResponseData for token efficiency
});

export type DirectionsResponse = z.infer<typeof DirectionsResponseSchema>;
export type Route = z.infer<typeof RouteSchema>;
export type RouteLeg = z.infer<typeof RouteLegSchema>;
export type RouteStep = z.infer<typeof RouteStepSchema>;
export type Waypoint = z.infer<typeof WaypointSchema>;
export type Intersection = z.infer<typeof IntersectionSchema>;
export type StepManeuver = z.infer<typeof StepManeuverSchema>;
export type VoiceInstruction = z.infer<typeof VoiceInstructionSchema>;
export type BannerInstruction = z.infer<typeof BannerInstructionSchema>;
export type Incident = z.infer<typeof IncidentSchema>;
export type Notification = z.infer<typeof NotificationSchema>;
