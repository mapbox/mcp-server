#!/usr/bin/env node

// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Simple tracing test script - generates traces to verify OTLP endpoint connectivity
 * This simulates tool executions and HTTP requests to test the tracing pipeline
 */

import { initializeTracing, shutdownTracing } from '../src/utils/tracing.js';
import { SearchTool } from '../src/tools/search-tool/SearchTool.js';

async function testTracing() {
  console.log('🔍 Testing OpenTelemetry tracing...\n');

  // Check environment
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!otlpEndpoint) {
    console.error('❌ OTEL_EXPORTER_OTLP_ENDPOINT not set');
    console.log(
      'Set endpoint: export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318'
    );
    process.exit(1);
  }

  console.log(`📡 OTLP Endpoint: ${otlpEndpoint}`);
  console.log(
    `🏷️  Service Name: ${process.env.OTEL_SERVICE_NAME || 'mapbox-mcp-server'}`
  );

  // Initialize tracing
  try {
    // Enable SSE transport for logging
    process.env.SERVER_TRANSPORT = 'sse';

    await initializeTracing();
    console.log('✅ Tracing initialized\n');
  } catch (error) {
    console.error('❌ Failed to initialize tracing:', error);
    process.exit(1);
  }

  // Create mock fetch for testing
  const mockFetch = async (url: string, options?: RequestInit) => {
    console.log(`🌐 Mock request: ${options?.method || 'GET'} ${url}`);

    // Simulate API delay
    await new Promise((resolve) =>
      setTimeout(resolve, 50 + Math.random() * 100)
    );

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
            properties: { accuracy: 'high' },
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
    // Test 1: Search tool execution
    console.log('🔧 Testing SearchTool execution...');
    const searchTool = new SearchTool({
      httpRequest: mockFetch as typeof fetch
    });

    const result1 = await searchTool.run({
      query: 'San Francisco, CA',
      access_token: 'pk.test_token_for_tracing'
    });

    console.log('✅ SearchTool completed');
    console.log(`📊 Result isError: ${result1.isError}\n`);

    // Test 2: Another search with different parameters
    console.log('🔧 Testing second SearchTool execution...');
    const result2 = await searchTool.run({
      query: 'New York City',
      access_token: 'pk.test_token_for_tracing',
      proximity: [-74.006, 40.7128],
      limit: 5
    });

    console.log('✅ Second SearchTool completed');
    console.log(`📊 Result isError: ${result2.isError}\n`);

    // Test 3: Simulate an error scenario
    console.log('🔧 Testing error scenario...');
    const errorFetch = async () => {
      throw new Error('Simulated API error for tracing test');
    };

    const errorTool = new SearchTool({
      httpRequest: errorFetch as typeof fetch
    });
    try {
      await errorTool.run({
        query: 'This will fail',
        access_token: 'pk.test_token_for_tracing'
      });
    } catch {
      console.log('✅ Error scenario traced correctly');
    }

    console.log('\n🎉 All tracing tests completed successfully!');
    console.log('\n📈 Check your OTLP endpoint for traces:');
    console.log('   - Tool executions: tool.search_tool');
    console.log('   - HTTP requests: http.get');
    console.log('   - Error traces with exception details\n');

    if (otlpEndpoint.includes('localhost:4318')) {
      console.log('🖥️  If using Jaeger: http://localhost:16686');
      console.log('   Service: mapbox-mcp-server');
      console.log('   Look for traces from the last few seconds\n');
    }
  } catch (error) {
    console.error('❌ Error during tracing test:', error);
  }

  // Clean shutdown
  console.log('🔄 Shutting down tracing...');
  await shutdownTracing();
  console.log('✅ Tracing test complete');
}

// Run the test
testTracing().catch((error) => {
  console.error('❌ Tracing test failed:', error);
  process.exit(1);
});
