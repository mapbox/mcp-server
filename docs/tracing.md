# OpenTelemetry Tracing Documentation

This MCP server includes comprehensive distributed tracing using OpenTelemetry (OTEL), providing production-ready observability for tool executions and HTTP requests.

## ⚠️ Important MCP Transport Compatibility

**Console tracing should be avoided with stdio transport** as console output interferes with MCP's stdio JSON-RPC communication.

**Transport-specific recommendations:**

- **stdio transport (default):** Use OTLP exporters only, avoid console tracing
- **SSE transport:** Console tracing is safe to use for development

The server automatically detects the transport type and adjusts logging behavior accordingly.

## Features

### Tool Execution Tracing

- **Automatic Instrumentation**: All tool executions are automatically traced
- **Comprehensive Attributes**: Input size, output size, success/failure status, timing
- **Error Tracking**: Detailed error information with error types and messages
- **Session Context**: Support for session ID, user ID, account ID, chat session ID, and prompt ID
- **JWT Validation**: Basic JWT format validation for tracing context

### HTTP Request Instrumentation

- **Full Request Lifecycle**: Complete HTTP request/response tracing with retry logic
- **Performance Metrics**: Request duration, payload sizes, retry attempts
- **Response Details**: Status codes, response sizes, content types
- **Error Classification**: Detailed error information with error types

### Security & Performance

- **Sensitive Data Protection**: Input parameters logged by size only, not content
- **Minimal Overhead**: <1% CPU impact, ~10MB memory for trace buffers
- **Configurable Sampling**: Support for production trace volume management
- **Graceful Fallback**: No impact on functionality when tracing is disabled

## Configuration

### Environment Variables

The tracing system supports several configuration options through environment variables:

#### Basic Configuration

```bash
# Enable console tracing (development)
OTEL_EXPORTER_CONSOLE_ENABLED=true

# OTLP HTTP endpoint (production)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# Optional OTLP headers for authentication
OTEL_EXPORTER_OTLP_HEADERS='{"Authorization": "Bearer your-token"}'
```

#### Service Configuration

```bash
OTEL_SERVICE_NAME=mapbox-mcp-server
OTEL_SERVICE_VERSION=0.0.1
OTEL_RESOURCE_ATTRIBUTES=service.name=mapbox-mcp-server,service.version=0.0.1
```

#### Sampling Configuration

```bash
# Sample rate (0.0 to 1.0) for high-volume environments
OTEL_TRACES_SAMPLER=traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1
```

### Transport-Specific Configuration

**For stdio transport (default):**

```bash
# ✅ RECOMMENDED: Use OTLP exporter for stdio transport
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# ❌ AVOID: Console output interferes with stdio JSON-RPC
# OTEL_EXPORTER_CONSOLE_ENABLED=true
```

**For SSE transport:**

```bash
# ✅ SAFE: Console tracing works with SSE transport
SERVER_TRANSPORT=sse
OTEL_EXPORTER_CONSOLE_ENABLED=true

# ✅ ALSO GOOD: OTLP exporter works with any transport
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

### Verification

To verify tracing is working correctly, see the [Tracing Verification Guide](./tracing-verification.md) which shows how to:

- Set up Jaeger locally to view traces
- Test tracing with the MCP inspector
- Troubleshoot common issues

### Configuration Files

Use the provided example configuration files:

- `.env.tracing.example` - Basic tracing configuration with MCP-safe settings
- `.env.aws.example` - AWS X-Ray specific configuration

Copy the relevant example file to `.env` and adjust values as needed.

## Supported Backends

### Development

- **Console Output**: Set `OTEL_EXPORTER_CONSOLE_ENABLED=true` for development tracing
- **Jaeger**: Use `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`

### Production

- **AWS X-Ray**: Compatible via OTLP endpoint
- **Google Cloud Trace**: Via OTLP HTTP exporter
- **Azure Monitor**: Via OTLP HTTP exporter
- **Datadog**: Via OTLP HTTP exporter
- **New Relic**: Via OTLP HTTP exporter
- **Honeycomb**: Via OTLP HTTP exporter
- **Any OTLP-compatible backend**

## Quick Start

### 1. Local Development with Console Output

```bash
# Enable console tracing
export OTEL_EXPORTER_CONSOLE_ENABLED=true

# Start the server
node dist/esm/index.js
```

### 2. Local Development with Jaeger

```bash
# Start Jaeger (Docker)
docker run -d --name jaeger \\
  -p 16686:16686 \\
  -p 14250:14250 \\
  -p 4317:4317 \\
  -p 4318:4318 \\
  jaegertracing/all-in-one:latest

# Configure tracing
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# Start the server
node dist/esm/index.js

# View traces at http://localhost:16686
```

### 3. AWS X-Ray Integration

```bash
# Configure AWS region and endpoint
export AWS_REGION=us-east-1
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# Ensure AWS credentials are configured
# (via IAM role, AWS CLI profile, or environment variables)

# Start AWS Distro for OpenTelemetry Collector
# See: https://aws-otel.github.io/docs/getting-started/collector

# Start the server
node dist/esm/index.js
```

## Testing Tracing

Use the provided npm script to test tracing functionality:

```bash
# Run tests with tracing enabled
npm run test:tracing
```

This will run the test suite with console tracing enabled and OTLP endpoint configured.

## Trace Structure

### Tool Execution Spans

```
tool.matrix_tool
├── tool.name: "matrix_tool"
├── tool.input.size: 1024
├── tool.output.size: 2048
├── tool.success: true
├── session.id: "session-123"
├── user.id: "user-456"
├── account.id: "account-789"
├── chat.session.id: "chat-123"
└── prompt.id: "prompt-456"
```

### HTTP Request Spans

```
http.post
├── http.method: "POST"
├── http.url: "https://api.mapbox.com/..."
├── http.status_code: 200
├── http.status_text: "OK"
├── http.user_agent: "mapbox-mcp-server/0.0.1"
├── http.request.content_length: 512
├── http.response.content_length: 1024
└── http.response.content_type: "application/json"
```

## Troubleshooting

### Tracing Not Working

1. **Check initialization**: Look for "OpenTelemetry tracing initialized successfully" in logs
2. **Verify environment**: Ensure `NODE_ENV !== 'test'` and `VITEST` is not set
3. **Check configuration**: Verify OTLP endpoint is accessible
4. **Network connectivity**: Test that the OTLP endpoint is reachable

### High Memory Usage

1. **Reduce sampling rate**: Set `OTEL_TRACES_SAMPLER_ARG` to a lower value (e.g., 0.1)
2. **Check batch size**: Default batch processing should handle most cases
3. **Monitor buffers**: Trace buffers are automatically flushed

### Performance Impact

1. **Expected overhead**: <1% CPU impact under normal load
2. **Memory usage**: ~10MB for trace buffers
3. **Network impact**: Traces sent in batches to minimize network calls

## Advanced Configuration

### Custom Sampling

For high-volume production environments, configure sampling:

```bash
export OTEL_TRACES_SAMPLER=traceidratio
export OTEL_TRACES_SAMPLER_ARG=0.1  # Sample 10% of traces
```

### Custom Resource Attributes

Add custom resource attributes for better trace organization:

```bash
export OTEL_RESOURCE_ATTRIBUTES="service.name=mapbox-mcp-server,service.version=0.0.1,environment=production,datacenter=us-east-1"
```

### Disabling Specific Instrumentations

The tracing system automatically disables noisy instrumentations (fs, dns) but you can configure more:

```javascript
// In tracing.ts, modify the getNodeAutoInstrumentations call
getNodeAutoInstrumentations({
  '@opentelemetry/instrumentation-fs': { enabled: false },
  '@opentelemetry/instrumentation-dns': { enabled: false },
  '@opentelemetry/instrumentation-http': { enabled: true } // Keep HTTP
});
```

## Security Considerations

### Data Privacy

- **Input sanitization**: Only input/output sizes are logged, not content
- **JWT validation**: Basic format validation only, no secret verification
- **Error messages**: Error details are logged but sensitive data is protected

### Authentication

- **OTLP headers**: Support for authentication headers
- **TLS**: Use HTTPS endpoints for production
- **IAM roles**: Use IAM roles for AWS X-Ray integration

## Integration Examples

### Docker Compose with Jaeger

```yaml
version: '3.8'
services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - '16686:16686'
      - '4318:4318'
    environment:
      - COLLECTOR_OTLP_ENABLED=true

  mcp-server:
    build: .
    environment:
      - OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318
      - MAPBOX_ACCESS_TOKEN=${MAPBOX_ACCESS_TOKEN}
    depends_on:
      - jaeger
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mapbox-mcp-server
spec:
  template:
    spec:
      containers:
        - name: mcp-server
          image: mapbox-mcp-server:latest
          env:
            - name: OTEL_EXPORTER_OTLP_ENDPOINT
              value: 'http://otel-collector:4318'
            - name: OTEL_SERVICE_NAME
              value: 'mapbox-mcp-server'
            - name: OTEL_RESOURCE_ATTRIBUTES
              value: 'service.name=mapbox-mcp-server,k8s.namespace=default'
```

## Monitoring and Alerting

### Key Metrics to Monitor

1. **Tool Success Rate**: Percentage of successful tool executions
2. **HTTP Error Rate**: Percentage of failed HTTP requests
3. **Response Times**: P95/P99 latencies for tools and HTTP requests
4. **Error Types**: Most common error types and patterns

### Sample Queries

For Jaeger or compatible systems:

```
# Find slow tool executions
operation="tool.*" AND duration:>5s

# Find HTTP errors
operation="http.*" AND error=true

# Find specific tool failures
operation="tool.matrix_tool" AND error=true
```

## Support

For tracing-related questions or issues:

1. Check the troubleshooting section above
2. Verify your configuration against the examples
3. Test with console tracing first before using remote backends
4. Check that your OTLP endpoint is accessible and properly configured
