// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HttpRequest } from '../../utils/types.js';
import type {
  TaskStore,
  CreateTaskRequestHandlerExtra,
  TaskRequestHandlerExtra
} from '@modelcontextprotocol/sdk/experimental/tasks/interfaces.js';
import { OptimizationV2InputSchema } from './OptimizationV2Tool.input.schema.js';
import {
  OptimizationV2OutputSchema,
  type OptimizationV2Output
} from './OptimizationV2Tool.output.schema.js';

/**
 * OptimizationV2Tool - Advanced route optimization using Mapbox Optimization API V2 (BETA)
 *
 * ⚠️ IMPORTANT: This tool uses the V2 API which is currently in beta and requires early access.
 * The tool is not registered by default. To enable it, add it to the toolRegistry.
 *
 * V2 Features:
 * - Time window constraints for services and shipments
 * - Vehicle capacity limits for multiple resource types
 * - Driver shifts with earliest start and latest end times
 * - Pickup and dropoff constraints for shipment handling
 * - Vehicle capabilities requirements (e.g., refrigeration, ladder)
 * - Loading policies (FIFO, LIFO, or any order)
 * - Mandated breaks for vehicles
 *
 * API documentation: https://docs.mapbox.com/api/navigation/optimization/
 */

/**
 * Helper function to validate JWT format
 */
function isValidJwtFormat(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  return parts.every((part) => part.length > 0);
}

/**
 * Helper function to get Mapbox API endpoint
 */
function getMapboxApiEndpoint(): string {
  return process.env.MAPBOX_API_ENDPOINT || 'https://api.mapbox.com/';
}

/**
 * Core function to submit optimization job to Mapbox API
 */
async function submitOptimizationJob(
  input: z.infer<typeof OptimizationV2InputSchema>,
  accessToken: string,
  httpRequest: HttpRequest
): Promise<{ jobId: string; status: string }> {
  // Validate: If vehicles are provided, at least one service or shipment is required
  if (input.vehicles && input.vehicles.length > 0) {
    const hasServices = input.services && input.services.length > 0;
    const hasShipments = input.shipments && input.shipments.length > 0;

    if (!hasServices && !hasShipments) {
      throw new Error(
        'When vehicles are provided, at least one service or shipment is required'
      );
    }
  }

  // Convert simplified input to Optimization API v2 format
  // Create locations array with auto-generated names
  const locations = input.coordinates.map((coord, index) => ({
    name: `location-${index}`,
    coordinates: [coord.longitude, coord.latitude] as [number, number]
  }));

  // If vehicles are not provided, create a default vehicle
  let vehicles: Array<unknown>;
  let services: Array<unknown>;
  let shipments: Array<unknown> | undefined;

  if (!input.vehicles || input.vehicles.length === 0) {
    // Simplified mode: auto-generate vehicle and services from coordinates
    vehicles = [
      {
        name: 'vehicle-1',
        routing_profile: input.profile,
        start_location: 'location-0', // Start at first location
        end_location: 'location-0' // Return to first location
      }
    ];

    // Create services for all locations except the first (which is start/end)
    services = input.coordinates.slice(1).map((_, index) => ({
      name: `service-${index + 1}`,
      location: `location-${index + 1}`,
      duration: 0 // No service time by default
    }));
  } else {
    // Advanced mode: use provided vehicles, services, and shipments
    vehicles = input.vehicles;
    services = input.services || [];
    shipments = input.shipments;
  }

  // Build request body
  const requestBody: {
    version: number;
    locations: Array<{ name: string; coordinates: [number, number] }>;
    vehicles: Array<unknown>;
    services: Array<unknown>;
    shipments?: Array<unknown>;
  } = {
    version: 1,
    locations,
    vehicles,
    services
  };

  if (shipments && shipments.length > 0) {
    requestBody.shipments = shipments;
  }

  // Step 1: POST to create optimization job
  const postUrl = `${getMapboxApiEndpoint()}optimized-trips/v2?access_token=${accessToken}`;

  const postResponse = await httpRequest(postUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  if (!postResponse.ok) {
    const errorText = await postResponse.text();
    let errorMessage = `Request failed with status ${postResponse.status}: ${postResponse.statusText}`;

    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.message) {
        errorMessage = `${errorMessage} - ${errorJson.message}`;
      }
    } catch {
      // If parsing fails, use the raw text
      if (errorText) {
        errorMessage = `${errorMessage} - ${errorText}`;
      }
    }

    throw new Error(errorMessage);
  }

  const postData = (await postResponse.json()) as {
    id: string;
    status: string;
  };

  return {
    jobId: postData.id,
    status: postData.status
  };
}

/**
 * Core function to poll optimization job status
 */
async function pollOptimizationJob(
  jobId: string,
  accessToken: string,
  httpRequest: HttpRequest
): Promise<{ status: number; data?: OptimizationV2Output; error?: string }> {
  const getUrl = `${getMapboxApiEndpoint()}optimized-trips/v2/${jobId}?access_token=${accessToken}`;
  const getResponse = await httpRequest(getUrl);

  if (!getResponse.ok) {
    if (getResponse.status === 404) {
      return {
        status: 404,
        error: `Optimization job ${jobId} not found`
      };
    }

    return {
      status: getResponse.status,
      error: `Request failed with status ${getResponse.status}: ${getResponse.statusText}`
    };
  }

  // HTTP 200 means the optimization is complete
  if (getResponse.status === 200) {
    const result = (await getResponse.json()) as OptimizationV2Output;
    return {
      status: 200,
      data: result
    };
  }

  // HTTP 202 means still processing
  return {
    status: 202
  };
}

/**
 * Background polling function that runs until job completes
 */
async function backgroundPollOptimizationJob(
  jobId: string,
  accessToken: string,
  httpRequest: HttpRequest,
  taskStore: TaskStore,
  taskId: string,
  maxAttempts: number,
  pollingInterval: number
): Promise<void> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const pollResult = await pollOptimizationJob(
        jobId,
        accessToken,
        httpRequest
      );

      if (pollResult.status === 200 && pollResult.data) {
        // Job completed successfully
        try {
          const validatedData = OptimizationV2OutputSchema.parse(
            pollResult.data
          );

          await taskStore.storeTaskResult(taskId, 'completed', {
            content: [
              { type: 'text', text: JSON.stringify(validatedData, null, 2) }
            ],
            structuredContent: validatedData
          });
        } catch {
          // If validation fails, return raw result anyway
          await taskStore.storeTaskResult(taskId, 'completed', {
            content: [
              { type: 'text', text: JSON.stringify(pollResult.data, null, 2) }
            ],
            structuredContent: pollResult.data
          });
        }
        return;
      } else if (pollResult.error) {
        // Job failed or not found
        await taskStore.storeTaskResult(taskId, 'failed', {
          content: [{ type: 'text', text: pollResult.error }],
          isError: true
        });
        return;
      }

      // Still processing (status 202), update task status
      await taskStore.updateTaskStatus(
        taskId,
        'working',
        `Processing optimization job (attempt ${attempts + 1}/${maxAttempts})`
      );

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollingInterval));
      attempts++;
    } catch (error) {
      // Error during polling
      await taskStore.storeTaskResult(taskId, 'failed', {
        content: [
          {
            type: 'text',
            text: `Error polling optimization job: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      });
      return;
    }
  }

  // Timed out
  await taskStore.storeTaskResult(taskId, 'failed', {
    content: [
      {
        type: 'text',
        text: `Optimization timed out after ${maxAttempts} attempts. Job ID: ${jobId}. You can check the status later using the job ID.`
      }
    ],
    isError: true
  });
}

/**
 * Register the Optimization V2 tool as a task-based tool
 *
 * ⚠️ BETA: This tool uses the V2 API which requires early access.
 * Not registered by default - call this function manually to enable.
 */
export function registerOptimizationV2Task(
  server: McpServer,
  httpRequest: HttpRequest
): void {
  server.experimental.tasks.registerToolTask(
    'optimization_v2_tool',
    {
      title: 'Optimization Tool V2 (Beta)',
      description:
        'Solves vehicle routing problems using the Mapbox Optimization API v2 (Beta). ' +
        'This is a long-running async task that submits an optimization job and polls for results. ' +
        'Supports up to 1000 coordinates in {longitude, latitude} format. ' +
        'Returns optimized routes with stops, ETAs, and dropped items. ' +
        '\n\n' +
        'USAGE MODES:\n' +
        '1. SIMPLIFIED MODE (recommended for basic routing): Provide only "coordinates" and optionally "profile". ' +
        'The tool will automatically create a default vehicle that visits all locations in optimized order, ' +
        'starting and ending at the first coordinate.\n' +
        '2. ADVANCED MODE (for complex scenarios): If you specify "vehicles", you MUST also provide either ' +
        '"services" (single stops like deliveries or pickups) or "shipments" (paired pickup/dropoff tasks). ' +
        'Each service/shipment defines a stop that vehicles must visit.\n' +
        '\n' +
        'KEY CONCEPTS:\n' +
        '- "services": Individual stops at locations (e.g., deliver package to address A, pick up at coffee shop B)\n' +
        '- "shipments": Paired pickup/delivery tasks (e.g., pick up from warehouse, deliver to customer)\n' +
        '- "vehicles": Routing agents with optional constraints like time windows, capacities, and capabilities\n' +
        '\n' +
        'LOCATION NAMING (CRITICAL):\n' +
        'The tool auto-generates STRING location names from your coordinates array as "location-0", "location-1", "location-2", etc. ' +
        'When creating services, shipments, or vehicles, you MUST reference these auto-generated STRINGS (NOT integers, NOT array indices):\n' +
        '- coordinates[0] → use STRING "location-0" (NOT integer 0)\n' +
        '\n' +
        'EXAMPLES:\n' +
        '✓ CORRECT: service.location = "location-2" (string)\n' +
        '✗ WRONG: service.location = 2 (integer)\n' +
        '\n' +
        'IMPORTANT: This is an async task. The task will start immediately but results will be available later via task polling.',
      inputSchema: OptimizationV2InputSchema,
      outputSchema: OptimizationV2OutputSchema,
      annotations: {
        title: 'Optimization Tool',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    {
      async createTask(args: unknown, extra: CreateTaskRequestHandlerExtra) {
        // Validate input
        const input = OptimizationV2InputSchema.parse(args);

        // Get and validate access token (from environment only for now)
        const accessToken =
          process.env.MAPBOX_ACCESS_TOKEN ||
          (
            extra as CreateTaskRequestHandlerExtra & {
              authInfo?: { token?: string };
            }
          ).authInfo?.token;
        if (!accessToken) {
          throw new Error(
            'No access token available. Please provide via Bearer auth or MAPBOX_ACCESS_TOKEN env var'
          );
        }
        if (!isValidJwtFormat(accessToken)) {
          throw new Error('Access token is not in valid JWT format');
        }

        // Create the task
        const task = await extra.taskStore.createTask({
          ttl: 300000 // 5 minutes TTL
        });

        // Submit optimization job to Mapbox API
        try {
          const { jobId } = await submitOptimizationJob(
            input,
            accessToken,
            httpRequest
          );

          // Start background polling (fire and forget)
          const maxAttempts = input.max_polling_attempts ?? 10;
          const pollingInterval = input.polling_interval_ms ?? 1000;

          // Don't await this - let it run in the background
          void backgroundPollOptimizationJob(
            jobId,
            accessToken,
            httpRequest,
            extra.taskStore,
            task.taskId,
            maxAttempts,
            pollingInterval
          );

          // Update task status to show it's working
          await extra.taskStore.updateTaskStatus(
            task.taskId,
            'working',
            `Optimization job submitted: ${jobId}`
          );

          // Return CreateTaskResult with the created task
          return {
            task
          };
        } catch (error) {
          // Failed to submit job, mark task as failed
          await extra.taskStore.storeTaskResult(task.taskId, 'failed', {
            content: [
              {
                type: 'text',
                text: `Failed to submit optimization job: ${error instanceof Error ? error.message : String(error)}`
              }
            ],
            isError: true
          });

          throw error;
        }
      },

      async getTask(_args: unknown, extra: TaskRequestHandlerExtra) {
        const task = await extra.taskStore.getTask(extra.taskId);
        if (!task) {
          throw new Error(`Task ${extra.taskId} not found`);
        }
        return task;
      },

      async getTaskResult(_args: unknown, extra: TaskRequestHandlerExtra) {
        const result = await extra.taskStore.getTaskResult(extra.taskId);
        // taskStore.getTaskResult returns a Result type, but we know we stored a CallToolResult
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return result as any;
      }
    }
  );
}
