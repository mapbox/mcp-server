#!/usr/bin/env node

/**
 * Simple test script to demonstrate OpenTelemetry tracing
 *
 * Usage:
 *   OTEL_ENABLE_CONSOLE_EXPORTER=true node scripts/test-tracing.js
 */

import { initializeTracing } from '../src/utils/tracing.js';
import { SearchAndGeocodeTool } from '../src/tools/search-and-geocode-tool/SearchAndGeocodeTool.js';

async function main() {
  console.log('🔍 Testing OpenTelemetry Tracing Integration\n');

  // Initialize tracing with console output
  await initializeTracing({
    serviceName: 'mcp-server-test',
    serviceVersion: '1.0.0',
    enableConsoleExporter: true
  });

  console.log('✅ Tracing initialized\n');

  // Create a mock fetch that simulates a successful response
  const mockFetch = async (url) => {
    console.log(
      '🌐 Mock HTTP request to:',
      url.replace(/access_token=[^&]+/, 'access_token=***')
    );

    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: (name) => (name === 'content-length' ? '1234' : null)
      },
      json: async () => ({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              name: 'Test Location',
              full_address: '123 Test St, Test City, TC 12345'
            },
            geometry: {
              type: 'Point',
              coordinates: [-122.4194, 37.7749]
            }
          }
        ]
      })
    };
  };

  // Test the search tool with tracing
  const tool = new SearchAndGeocodeTool(mockFetch);

  console.log('🔧 Running search tool...\n');

  // Set a mock access token for testing
  process.env.MAPBOX_ACCESS_TOKEN = 'pk.test.mock-token-for-tracing-demo';

  const result = await tool.run({
    q: 'coffee shop',
    proximity: { longitude: -122.4194, latitude: 37.7749 }
  });

  console.log('📊 Tool execution result:');
  console.log('- Success:', !result.isError);
  console.log('- Content type:', result.content[0]?.type);
  console.log('- Has structured data:', !!result.structuredContent);
  console.log(
    '- Text preview:',
    result.content[0]?.text?.substring(0, 100) + '...'
  );

  console.log('\n✨ Tracing test completed!');
  console.log('\nCheck the console output above for trace data.');
  console.log(
    'In production, this would be sent to any OTLP-compatible backend (Jaeger, Zipkin, etc.).'
  );
}

main().catch(console.error);
