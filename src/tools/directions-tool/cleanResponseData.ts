import { z } from 'zod';
import { DirectionsInputSchema } from './DirectionsTool.js';

/**
 * Cleans up the API response to reduce token count while preserving useful data.
 *
 * @param input The original input parameters used for the request
 * @param data The raw response data from the Mapbox Directions API
 * @returns Cleaned data with reduced token count
 */
export function cleanResponseData(
  input: z.infer<typeof DirectionsInputSchema>,
  data: any
): any {
  // Remove unnecessary keys to reduce token count
  if ('uuid' in data) {
    delete data.uuid;
  }

  if ('code' in data) {
    delete data.code;
  }

  if ('waypoints' in data) {
    // rename each waypoint's location to `snap_location` and distance to `snap_distance`
    // this is not really necessary, but hopefully agents will find this more obvious that we have snapping
    data.waypoints = data.waypoints.map((waypoint: any) => {
      const updatedWaypoint = { ...waypoint };
      if ('location' in updatedWaypoint) {
        updatedWaypoint.snap_location = updatedWaypoint.location;
        delete updatedWaypoint.location;
      }
      if ('distance' in updatedWaypoint) {
        updatedWaypoint.snap_distance = Math.round(updatedWaypoint.distance);
        delete updatedWaypoint.distance;
      }
      return updatedWaypoint;
    });
  }

  if (!('routes' in data)) {
    // lets return early because there is nothing more we could do here
    return data;
  }

  data.routes.forEach((route: any) => {
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

    route.leg_summaries = route.legs.map((leg: any) => leg.summary);

    // Collect all unique admins across all legs of this route
    const routeUniqueIsoCodes = new Set<string>();

    // Collect all unique notification messages across all legs of this route
    const routeUniqueNotificationMessages = new Set<string>();

    // Collect all incidents across all legs of this route
    const routeIncidents: any[] = [];

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

    route.legs.forEach((leg: any) => {
      if (leg.annotation && leg.annotation.speed && leg.annotation.distance) {
        leg.annotation.speed.forEach((speed: number, index: number) => {
          const speedValue = parseFloat(String(speed));
          const distance = parseFloat(String(leg.annotation.distance[index]));
          // Calculate the weighted speed (speed * distance)
          totalDistanceWeightedSpeed += speedValue * distance;
          sumDistanceMeters += distance;
        });
      }

      if (
        leg.annotation &&
        leg.annotation.congestion &&
        leg.annotation.distance
      ) {
        // iterate every congestion string in leg.annotation.congestion
        // each string is one of `severe, heavy, moderate, low, unknown`
        // keep track of total distance by type of congestion
        leg.annotation.congestion.forEach(
          (congestion: string, index: number) => {
            const distance = parseFloat(String(leg.annotation.distance[index]));
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

      if (leg.admins && Array.isArray(leg.admins)) {
        // Extract unique ISO codes from this leg
        leg.admins.forEach((admin: any) => {
          if (admin.iso_3166_1_alpha3) {
            routeUniqueIsoCodes.add(admin.iso_3166_1_alpha3);
          }
        });
      }

      // Process notifications if they exist
      if (leg.notifications && Array.isArray(leg.notifications)) {
        // Extract unique notification messages from this leg
        leg.notifications.forEach((notification: any) => {
          if (notification.details && notification.details.message) {
            routeUniqueNotificationMessages.add(notification.details.message);
          }
        });
      }

      // Process incidents if they exist
      if (leg.incidents && Array.isArray(leg.incidents)) {
        leg.incidents.forEach((incident: any) => {
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
      if (leg.steps && Array.isArray(leg.steps)) {
        leg.steps.forEach((step: any) => {
          if (step.voiceInstructions && Array.isArray(step.voiceInstructions)) {
            step.voiceInstructions.forEach((instruction: any) => {
              if (instruction.announcement) {
                routeAnnouncements.push(instruction.announcement);
              }
            });
          }
        });
      }
    }); // Add all unique admins as a new property on the route
    route.intersecting_admins = Array.from(routeUniqueIsoCodes);

    // Add all unique notification messages as a new property on the route
    route.notifications_summary = Array.from(routeUniqueNotificationMessages);

    // Add all incidents with the specified fields as a new property on the route
    route.incidents_summary = routeIncidents;

    // Add voice instruction announcements only if there are 1 to 10 of them
    // If there are more than 10, it's just too many, and if there is 0 then we don't have them.
    if (routeAnnouncements.length >= 1 && routeAnnouncements.length <= 10) {
      route.instructions = routeAnnouncements;
    }

    route.num_legs = route.legs.length;

    // Add congestion distance information to route
    route.congestion_information = {
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
      route.average_speed_kph = Math.round(averageMetersPerSecond * 3.6);
    }

    if (route.duration_typical) {
      route.duration_under_typical_traffic_conditions = Math.round(
        route.duration_typical
      );
      delete route.duration_typical;
    }

    if (route.weight_typical) {
      delete route.weight_typical;
    }

    delete route.legs;
  });

  return data;
}
