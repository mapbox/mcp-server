#!/usr/bin/env node

// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Integration test script to verify OpenTelemetry tracing works with MCP tools
 * This script demonstrates tracing in action with console output
 */

import { initializeTracing, shutdownTracing } from '../src/utils/tracing.js';
import { ReverseGeocodeTool } from '../src/tools/reverse-geocode-tool/ReverseGeocodeTool.js';

// ⚠️ NOTE: This demo uses console output for demonstration only
// In real MCP stdio transport usage, use OTLP exporters instead
// Console output interferes with MCP's stdio JSON-RPC communication
process.env.OTEL_EXPORTER_CONSOLE_ENABLED = 'true';

async function runTracingDemo() {
  console.log('🚀 Starting OpenTelemetry tracing demo...\n');

  // Initialize tracing with console output
  await initializeTracing();

  // Create a mock fetch function that simulates a successful API response
  const mockFetch = async (url: string, options?: RequestInit) => {
    console.log(`📡 Mock HTTP request: ${options?.method || 'GET'} ${url}`);

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'content-type': 'application/json'
      }),
      json: async () => ({
        features: [
          {
            place_name: 'Test Location',
            center: [-122.4194, 37.7749],
            properties: {},
            geometry: {
              type: 'Point',
              coordinates: [-122.4194, 37.7749]
            }
          }
        ]
      })
    } as Response;
  };

  try {
    // Create tool with mock fetch
    const geocodeTool = new ReverseGeocodeTool({
      httpRequest: mockFetch as typeof fetch
    });

    console.log('🔍 Executing reverse geocoding tool with tracing...\n');

    // Execute the tool - this should create traces
    const result = await geocodeTool.run({
      longitude: -122.4194,
      latitude: 37.7749,
      access_token: 'pk.test_token'
    });

    console.log('\n✅ Tool execution completed successfully!');
    console.log('📊 Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Error during tool execution:', error);
  }

  // Shutdown tracing
  console.log('\n🔄 Shutting down tracing...');
  await shutdownTracing();
  console.log('✅ Tracing demo completed!\n');

  console.log(
    '💡 In production, traces would be sent to your observability backend (Jaeger, AWS X-Ray, etc.)'
  );
  console.log('📖 See docs/tracing.md for configuration details');
}

// Run the demo if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTracingDemo().catch(console.error);
}

export { runTracingDemo };
