# Tracing Verification Guide

This guide shows how to verify that OpenTelemetry tracing is working correctly with the MCP server.

## Quick Start with Jaeger

### 1. Start Jaeger (One-time setup)

```bash
# Start Jaeger in Docker (requires Docker to be installed)
npm run tracing:jaeger:start
```

This starts Jaeger with:

- **UI**: http://localhost:16686 (view traces here)
- **OTLP HTTP endpoint**: http://localhost:4318 (where our traces go)

### 2. Run MCP Server with Tracing

```bash
# Run the MCP inspector with tracing enabled
npm run inspect:build:tracing
```

This will:

- Build the server
- Start it with SSE transport (so we get console logs)
- Enable tracing with OTLP endpoint pointing to Jaeger
- Set service name to `mapbox-mcp-server-inspector`

### 3. Generate Some Traces

In the MCP inspector:

1. Execute any tool (e.g., search for "San Francisco")
2. Try multiple tools to generate various traces
3. Each tool execution creates traces

### 4. View Traces in Jaeger

1. Open http://localhost:16686 in your browser
2. Select service: `mapbox-mcp-server-inspector`
3. Click "Find Traces"
4. You should see traces for:
   - Tool executions (e.g., `tool.search_tool`)
   - HTTP requests (e.g., `http.get`)
   - Any errors or performance issues

### 5. Stop Jaeger (When done)

```bash
npm run tracing:jaeger:stop
```

## What to Look For

### Successful Tracing Setup

✅ **Console output shows**: `OpenTelemetry tracing: enabled`

✅ **Jaeger UI shows traces** for your service

✅ **Trace details include**:

- Tool name and execution time
- HTTP requests to Mapbox APIs
- Input/output sizes
- Success/error status
- Session context (if using JWT)

### Troubleshooting

❌ **"OpenTelemetry tracing: disabled"**

- Check that `OTEL_EXPORTER_OTLP_ENDPOINT` is set
- Verify Jaeger is running: `docker ps | grep jaeger`

❌ **No traces in Jaeger**

- Wait a few seconds after tool execution
- Check Jaeger is receiving data: http://localhost:16686
- Verify the service name matches: `mapbox-mcp-server-inspector`

❌ **Docker not available**

- Use alternative OTLP collector
- Or run with console tracing: `OTEL_EXPORTER_CONSOLE_ENABLED=true npm run demo:tracing`

## Alternative OTLP Endpoints

### Local OTEL Collector

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

### AWS X-Ray (via ADOT)

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:2000
AWS_REGION=us-east-1
```

### Google Cloud Trace

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=https://cloudtrace.googleapis.com/v1/projects/PROJECT_ID/traces:batchWrite
```

### Honeycomb

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.honeycomb.io/v1/traces
OTEL_EXPORTER_OTLP_HEADERS='{"x-honeycomb-team":"YOUR_API_KEY"}'
```

## Verifying Different Transports

### SSE Transport (HTTP) - Full Logging

```bash
SERVER_TRANSPORT=sse OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 npm run inspect:build
```

### stdio Transport - Silent Operation

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 npm run inspect:build
```

## Production Considerations

- **Performance**: Tracing adds <1% CPU overhead
- **Network**: Each trace is ~1-5KB sent to OTLP endpoint
- **Sampling**: Use `OTEL_TRACES_SAMPLER=traceidratio` and `OTEL_TRACES_SAMPLER_ARG=0.1` for high-volume environments
- **Security**: Traces don't include sensitive input data, only metadata

## Example Trace Data

A successful tool execution trace includes:

```json
{
  "traceId": "1234567890abcdef",
  "spanId": "abcdef1234567890",
  "operationName": "tool.search_tool",
  "startTime": "2025-10-07T12:00:00Z",
  "duration": "245ms",
  "tags": {
    "tool.name": "search_tool",
    "tool.input.size": 156,
    "tool.output.size": 2048,
    "session.id": "session-uuid",
    "http.method": "GET",
    "http.url": "https://api.mapbox.com/search/...",
    "http.status_code": 200
  }
}
```

This gives you complete visibility into tool performance, API calls, and any issues.
