# OpenTelemetry Tracing Documentation

This MCP server includes comprehensive distributed tracing using OpenTelemetry (OTEL), providing production-ready observability for tool executions and HTTP requests.

## ⚠️ Important MCP Transport Compatibility

**Console tracing should be avoided with stdio transport** as console output interferes with MCP's stdio JSON-RPC communication.

**Transport-specific recommendations:**

- **stdio transport (default):** Use OTLP exporters only, avoid console tracing
- **SSE transport:** Console tracing is safe to use for development

The server automatically detects the transport type and adjusts logging behavior accordingly.

## Features

### Configuration Loading Tracing

- **Environment Variable Loading**: Automatic tracing of .env file loading
- **Load Metrics**: Number of variables loaded, file existence, load success
- **Error Tracking**: Detailed errors if configuration loading fails
- **Startup Visibility**: See configuration issues at server startup

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
- **CloudFront Correlation**: Automatic capture of CloudFront IDs for Mapbox API requests
- **Cache Monitoring**: CloudFront cache hit/miss tracking via x-cache headers
- **Geographic Insights**: CloudFront PoP location for geographic distribution analysis
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

### Configuration File

Use the provided `.env.example` file which includes:

- Required settings (Mapbox API token)
- OpenTelemetry tracing configuration (Jaeger/OTLP)
- Optional AWS X-Ray configuration (commented out)
- All MCP server settings

**Setup:**

```bash
# Copy the example configuration
cp .env.example .env

# Edit .env to:
#   1. Add your MAPBOX_ACCESS_TOKEN
#   2. Uncomment tracing settings for Jaeger/OTLP
#   3. Or uncomment AWS X-Ray settings if using AWS
```

The server automatically loads configuration from `.env` at startup, eliminating the need for inline environment variables in npm scripts.

## Supported Backends

The server supports **any OTLP-compatible observability backend**. Configuration examples are provided in `.env.example` for:

### Development

- **Jaeger**: Local development with Docker (see Quick Start)
  - `npm run tracing:jaeger:start`
  - Endpoint: `http://localhost:4318`
  - UI: `http://localhost:16686`

### Production Cloud Providers

- **AWS X-Ray**: AWS-native distributed tracing

  - Endpoint: AWS Distro for OpenTelemetry Collector
  - Auth: IAM credentials
  - [Setup Guide](https://aws-otel.github.io/docs/getting-started/collector)

- **Azure Monitor**: Azure Application Insights

  - Endpoint: `https://<region>.livediagnostics.monitor.azure.com`
  - Auth: Connection string or AAD token
  - [Setup Guide](https://learn.microsoft.com/en-us/azure/azure-monitor/app/opentelemetry-enable)

- **Google Cloud Trace**: GCP-native tracing
  - Endpoint: `https://cloudtrace.googleapis.com`
  - Auth: Application Default Credentials
  - [Setup Guide](https://cloud.google.com/trace/docs/setup)

### Production SaaS Observability Platforms

- **Datadog**: Full-stack observability platform

  - Endpoint: `https://api.datadoghq.com/api/v2/traces` or local agent
  - Auth: API key
  - [Setup Guide](https://docs.datadoghq.com/tracing/trace_collection/opentelemetry/)

- **New Relic**: Application performance monitoring

  - Endpoint: `https://otlp.nr-data.net:4318` (US) or `https://otlp.eu01.nr-data.net:4318` (EU)
  - Auth: License key
  - [Setup Guide](https://docs.newrelic.com/docs/more-integrations/open-source-telemetry-integrations/opentelemetry/opentelemetry-setup/)

- **Honeycomb**: Observability for complex systems
  - Endpoint: `https://api.honeycomb.io:443`
  - Auth: API key + dataset name
  - [Setup Guide](https://docs.honeycomb.io/getting-data-in/opentelemetry-overview/)

### Configuration

All backends are configured via `.env` file. See `.env.example` for complete configuration examples for each platform.

## Quick Start

### 1. Setup .env Configuration

```bash
# Copy the example configuration
cp .env.example .env

# Edit .env to:
#   1. Add your MAPBOX_ACCESS_TOKEN
#   2. The OTEL_EXPORTER_OTLP_ENDPOINT is already set to http://localhost:4318
#   3. Customize OTEL_SERVICE_NAME if needed
```

### 2. Local Development with Jaeger

```bash
# Start Jaeger (Docker)
npm run tracing:jaeger:start

# Build and run the server with MCP inspector
npm run inspect:build

# View traces at http://localhost:16686

# Stop Jaeger when done
npm run tracing:jaeger:stop
```

### 3. AWS X-Ray Integration

```bash
# Edit .env and uncomment AWS X-Ray settings:
#   - AWS_REGION=us-east-1
#   - Update OTEL_RESOURCE_ATTRIBUTES to include aws.region
#   - Uncomment OTEL_EXPORTER_OTLP_HEADERS for X-Ray trace IDs

# Ensure AWS credentials are configured
# (via IAM role, AWS CLI profile, or environment variables)

# Start AWS Distro for OpenTelemetry Collector
# See: https://aws-otel.github.io/docs/getting-started/collector

# Start the server
npm run inspect:build
```

## Trace Structure

### Configuration Loading Spans

The server traces configuration loading at startup:

```
config.load_env
├── config.file.path: "/path/to/.env"
├── config.file.exists: true
├── config.vars.loaded: 5
├── operation.type: "config_load"
└── config.load.success: true
```

This span captures:

- Whether the .env file exists
- Number of environment variables loaded
- Any errors during configuration loading
- Overall success/failure status

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
├── http.response.content_type: "application/json"
├── http.response.header.x_amz_cf_id: "HsL_E2ZgW72g4tg_ppvpljSFWa2yYcWziQjZ4d7_1czoC7-53UkAdg=="
├── http.response.header.x_amz_cf_pop: "IAD55-P3"
├── http.response.header.x_cache: "Miss from cloudfront"
└── http.response.header.etag: "W/\"21fe5-88gHkqbxd+dMWiCvnvxi2sikhUs\""
```

#### CloudFront Correlation IDs

For Mapbox API requests, the tracing system automatically captures CloudFront correlation headers:

- **`x-amz-cf-id`**: CloudFront request ID for correlation with AWS support
- **`x-amz-cf-pop`**: CloudFront Point of Presence location
- **`x-cache`**: Cache hit/miss status from CloudFront
- **`etag`**: Entity tag for cache validation

These headers enable:

- Correlation with Mapbox API logs and support tickets
- Geographic distribution analysis (via PoP location)
- Cache performance monitoring
- End-to-end request tracing through CloudFront

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
