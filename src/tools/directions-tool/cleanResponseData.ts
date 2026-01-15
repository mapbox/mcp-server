// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { z } from 'zod';
import type { DirectionsInputSchema } from './DirectionsTool.input.schema.js';

// Raw API response types (before cleaning)
interface RawWaypoint {
  name?: string;
  location?: [number, number];
  distance?: number;
  [key: string]: unknown;
}

interface RawAnnotation {
  distance?: number[];
  speed?: number[];
  congestion?: string[];
  [key: string]: unknown;
}

interface RawAdmin {
  iso_3166_1_alpha3?: string;
  [key: string]: unknown;
}

interface RawNotification {
  details?: {
    message?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface RawIncident {
  type?: string;
  end_time?: string;
  long_description?: string;
  impact?: string;
  affected_road_names?: string[];
  length?: number;
  [key: string]: unknown;
}

interface RawVoiceInstruction {
  announcement?: string;
  [key: string]: unknown;
}

interface RawStep {
  voiceInstructions?: RawVoiceInstruction[];
  [key: string]: unknown;
}

interface RawLeg {
  summary?: string;
  admins?: RawAdmin[];
  annotation?: RawAnnotation;
  notifications?: RawNotification[];
  incidents?: RawIncident[];
  steps?: RawStep[];
  [key: string]: unknown;
}

interface RawRoute {
  duration?: number;
  distance?: number;
  weight_name?: string;
  weight?: number;
  duration_typical?: number | null;
  weight_typical?: number | null;
  geometry?: unknown;
  legs?: RawLeg[];
  [key: string]: unknown;
}

interface RawDirectionsResponse {
  uuid?: string;
  code?: string;
  waypoints?: RawWaypoint[];
  routes?: RawRoute[];
  [key: string]: unknown;
}

// Cleaned response types (after cleaning)
interface CleanedRoute extends Omit<
  RawRoute,
  'legs' | 'weight_name' | 'weight' | 'duration_typical' | 'weight_typical'
> {
  leg_summaries?: string[];
  intersecting_admins?: string[];
  notifications_summary?: string[];
  incidents_summary?: Array<{
    type?: string;
    end_time?: string;
    long_description?: string;
    impact?: string;
    affected_road_names?: string[];
    length?: number;
  }>;
  instructions?: string[];
  num_legs?: number;
  congestion_information?: {
    length_low: number;
    length_moderate: number;
    length_heavy: number;
    length_severe: number;
  };
  average_speed_kph?: number;
  duration_under_typical_traffic_conditions?: number;
}

interface CleanedWaypoint extends Omit<RawWaypoint, 'location' | 'distance'> {
  snap_location?: [number, number];
  snap_distance?: number;
}

interface CleanedDirectionsResponse extends Omit<
  RawDirectionsResponse,
  'uuid' | 'code' | 'waypoints' | 'routes'
> {
  waypoints?: CleanedWaypoint[];
  routes?: CleanedRoute[];
}

/**
 * Cleans up the API response to reduce token count while preserving useful data.
 *
 * @param input The original input parameters used for the request
 * @param data The raw response data from the Mapbox Directions API
 * @returns Cleaned data with reduced token count
 */
export function cleanResponseData(
  input: z.infer<typeof DirectionsInputSchema>,
  data: RawDirectionsResponse
): CleanedDirectionsResponse {
  // Remove unnecessary keys to reduce token count
  if ('uuid' in data) {
    delete data.uuid;
  }

  if ('code' in data) {
    delete data.code;
  }

  if (data.waypoints) {
    // rename each waypoint's location to `snap_location` and distance to `snap_distance`
    // this is not really necessary, but hopefully agents will find this more obvious that we have snapping
    data.waypoints = data.waypoints.map((waypoint) => {
      const updatedWaypoint: CleanedWaypoint = { ...waypoint };
      if (waypoint.location) {
        updatedWaypoint.snap_location = waypoint.location;
        delete (updatedWaypoint as RawWaypoint).location;
      }
      if (waypoint.distance !== undefined) {
        updatedWaypoint.snap_distance = Math.round(waypoint.distance);
        delete (updatedWaypoint as RawWaypoint).distance;
      }
      return updatedWaypoint;
    }) as CleanedWaypoint[];
  }

  if (!data.routes) {
    // lets return early because there is nothing more we could do here
    return data;
  }

  data.routes.forEach((route) => {
    // Round duration and distance to integers if they exist
    if (route.duration !== undefined) {
      route.duration = Math.round(route.duration);
    }
    if (route.distance !== undefined) {
      route.distance = Math.round(route.distance);
    }

    delete route.weight_name;
    delete route.weight;

    // Handle the case where geometry is not included (when geometries='none')
    if (input.geometries === 'none' && route.geometry) {
      delete route.geometry;
    }

    const routeLegSummaries = route.legs?.map((leg) => leg.summary || '') || [];

    // Collect all unique admins across all legs of this route
    const routeUniqueIsoCodes = new Set<string>();

    // Collect all unique notification messages across all legs of this route
    const routeUniqueNotificationMessages = new Set<string>();

    // Collect all incidents across all legs of this route
    const routeIncidents: Array<{
      type?: string;
      end_time?: string;
      long_description?: string;
      impact?: string;
      affected_road_names?: string[];
      length?: number;
    }> = [];

    // Collect voice instruction announcements from all steps
    const routeAnnouncements: string[] = [];

    let totalDistanceWeightedSpeed = 0; // Sum of (speed × distance) for each segment
    let sumDistanceMeters = 0;

    // Object to track distance by congestion type
    const congestionTypeToDistance = {
      severe: 0,
      heavy: 0,
      moderate: 0,
      low: 0
    };

    if (route.legs) {
      route.legs.forEach((leg) => {
        if (leg.annotation?.speed && leg.annotation?.distance) {
          leg.annotation.speed.forEach((speed: number, index: number) => {
            const speedValue = parseFloat(String(speed));
            const distance = parseFloat(
              String(leg.annotation!.distance![index])
            );
            // Calculate the weighted speed (speed * distance)
            totalDistanceWeightedSpeed += speedValue * distance;
            sumDistanceMeters += distance;
          });
        }

        if (leg.annotation?.congestion && leg.annotation?.distance) {
          // iterate every congestion string in leg.annotation.congestion
          // each string is one of `severe, heavy, moderate, low, unknown`
          // keep track of total distance by type of congestion
          leg.annotation.congestion.forEach(
            (congestion: string, index: number) => {
              const distance = parseFloat(
                String(leg.annotation!.distance![index])
              );
              if (
                congestion === 'severe' ||
                congestion === 'heavy' ||
                congestion === 'moderate' ||
                congestion === 'low'
              ) {
                congestionTypeToDistance[congestion] += distance;
              }
              // Skip 'unknown' congestion type
            }
          );
        }

        if (leg.admins) {
          // Extract unique ISO codes from this leg
          leg.admins.forEach((admin) => {
            if (admin.iso_3166_1_alpha3) {
              routeUniqueIsoCodes.add(admin.iso_3166_1_alpha3);
            }
          });
        }

        // Process notifications if they exist
        if (leg.notifications) {
          // Extract unique notification messages from this leg
          leg.notifications.forEach((notification) => {
            if (notification.details?.message) {
              routeUniqueNotificationMessages.add(notification.details.message);
            }
          });
        }

        // Process incidents if they exist
        if (leg.incidents) {
          leg.incidents.forEach((incident) => {
            // Extract only the specified fields for each incident
            routeIncidents.push({
              type: incident.type,
              end_time: incident.end_time,
              long_description: incident.long_description,
              impact: incident.impact,
              affected_road_names: incident.affected_road_names,
              length: incident.length
            });
          });
        }

        // Process steps if they exist to collect voice instructions
        if (leg.steps) {
          leg.steps.forEach((step) => {
            if (step.voiceInstructions) {
              step.voiceInstructions.forEach((instruction) => {
                if (instruction.announcement) {
                  routeAnnouncements.push(instruction.announcement);
                }
              });
            }
          });
        }
      });
    }

    // Add all unique admins as a new property on the route
    const cleanedRoute = route as CleanedRoute;
    cleanedRoute.leg_summaries = routeLegSummaries;
    cleanedRoute.intersecting_admins = Array.from(routeUniqueIsoCodes);

    // Add all unique notification messages as a new property on the route
    cleanedRoute.notifications_summary = Array.from(
      routeUniqueNotificationMessages
    );

    // Add all incidents with the specified fields as a new property on the route
    cleanedRoute.incidents_summary = routeIncidents;

    // Add voice instruction announcements only if there are 1 to 10 of them
    // If there are more than 10, it's just too many, and if there is 0 then we don't have them.
    if (routeAnnouncements.length >= 1 && routeAnnouncements.length <= 10) {
      cleanedRoute.instructions = routeAnnouncements;
    }

    cleanedRoute.num_legs = route.legs?.length || 0;

    // Add congestion distance information to route
    cleanedRoute.congestion_information = {
      length_low: Math.round(congestionTypeToDistance.low),
      length_moderate: Math.round(congestionTypeToDistance.moderate),
      length_heavy: Math.round(congestionTypeToDistance.heavy),
      length_severe: Math.round(congestionTypeToDistance.severe)
    };

    // Calculate and add average speed in km/h
    if (sumDistanceMeters > 0 && totalDistanceWeightedSpeed > 0) {
      // Calculate distance-weighted average speed
      const averageMetersPerSecond =
        totalDistanceWeightedSpeed / sumDistanceMeters;
      // Convert m/s to km/h (multiply by 3.6) and round to integer
      cleanedRoute.average_speed_kph = Math.round(averageMetersPerSecond * 3.6);
    }

    if (route.duration_typical) {
      cleanedRoute.duration_under_typical_traffic_conditions = Math.round(
        route.duration_typical
      );
      delete (cleanedRoute as RawRoute).duration_typical;
    }

    delete (cleanedRoute as RawRoute).weight_typical;
    delete (cleanedRoute as RawRoute).legs;
  });

  return data;
}
