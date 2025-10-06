# OpenTelemetry Tracing in Mapbox MCP Server

This document describes how to enable and use OpenTelemetry distributed tracing in the Mapbox MCP Server.

## Overview

The Mapbox MCP Server includes comprehensive OpenTelemetry tracing that provides visibility into:

> **Note**: We use the modern OTLP (OpenTelemetry Protocol) HTTP exporter, which replaces the deprecated Jaeger-specific exporter. OTLP is vendor-neutral and works with Jaeger, Zipkin, and other tracing backends.

- **Tool Execution**: Each tool invocation is traced with timing, input parameters, and success/failure status
- **HTTP Requests**: All API calls to Mapbox services are instrumented with request/response details
- **Error Tracking**: Failed operations are recorded with detailed error information
- **Performance Metrics**: Request duration, payload sizes, and retry attempts

## Quick Start

### 1. Basic Console Tracing (Development)

For development, you can enable console-based tracing:

```bash
# Set environment variable
export OTEL_ENABLE_CONSOLE_EXPORTER=true

# Run the server
npm run dev:inspect
```

### 2. OTLP Tracing (Production)

For production monitoring, use OTLP with Jaeger or other compatible backends:

```bash
# Start Jaeger with OTLP support (using Docker)
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 4317:4317 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest

# Configure environment
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# Run the server
node dist/esm/index.js
```

### 3. AWS Tracing Services

#### AWS X-Ray

Use AWS X-Ray for fully managed distributed tracing:

```bash
# Configure AWS X-Ray OTLP endpoint
export OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.us-east-1.amazonaws.com:4318
export AWS_REGION=us-east-1

# Ensure AWS credentials are configured
# (via IAM role, environment variables, or AWS CLI)
```

#### AWS CloudWatch

Send traces directly to CloudWatch:

```bash
# CloudWatch OTLP endpoint
export OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-ingest.us-east-1.amazonaws.com/traces
export AWS_REGION=us-east-1
```

#### Amazon Managed Prometheus + Grafana

For comprehensive observability with Prometheus metrics:

```bash
# Enable Prometheus for AMP
export OTEL_ENABLE_PROMETHEUS=true
export OTEL_PROMETHEUS_PORT=9090

# AMP workspace endpoint (replace with your workspace)
export AMP_WORKSPACE_URL=https://aps-workspaces.us-east-1.amazonaws.com/workspaces/ws-12345678-1234-1234-1234-123456789012/
```

### 4. Prometheus Metrics

Enable Prometheus metrics collection:

```bash
export OTEL_ENABLE_PROMETHEUS=true
export OTEL_PROMETHEUS_PORT=9090

# Metrics will be available at http://localhost:9090/metrics
```

## Configuration

### Environment Variables

| Variable                             | Description                     | Default              |
| ------------------------------------ | ------------------------------- | -------------------- |
| `OTEL_ENABLE_CONSOLE_EXPORTER`       | Enable console trace output     | `false`              |
| `OTEL_EXPORTER_OTLP_ENDPOINT`        | OTLP collector endpoint         | None                 |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | OTLP traces endpoint            | None                 |
| `OTEL_ENABLE_PROMETHEUS`             | Enable Prometheus metrics       | `false`              |
| `OTEL_PROMETHEUS_PORT`               | Prometheus metrics port         | `9090`               |
| `OTEL_SERVICE_NAME`                  | Service name in traces          | `@mapbox/mcp-server` |
| `OTEL_SERVICE_VERSION`               | Service version                 | Package version      |
| `AWS_REGION`                         | AWS region for X-Ray/CloudWatch | None                 |

### Configuration File

Copy the example configuration:

```bash
cp .env.tracing.example .env.local
```

Edit `.env.local` with your settings:

```bash
# Enable development tracing
NODE_ENV=development
OTEL_ENABLE_CONSOLE_EXPORTER=true

# Or configure Jaeger for production
# JAEGER_ENDPOINT=http://jaeger:14268/api/traces
# OTEL_ENABLE_PROMETHEUS=true
```

## Trace Data Structure

### Tool Spans

Each tool execution creates a span with:

```
span: tool.{tool_name}.execute
attributes:
  - tool.name: string
  - tool.operation: "execute"
  - tool.input.size: number (bytes)
  - tool.has_extra: boolean
  - tool.has_token: boolean
  - tool.token_valid: boolean
  - tool.result.type: string
  - tool.success: boolean
  - tool.error.message?: string
  - tool.error.type?: string
```

### HTTP Spans

HTTP requests to Mapbox APIs create spans with:

```
span: HTTP {method}
attributes:
  - http.method: string
  - http.url: string
  - http.host: string
  - http.scheme: string
  - http.target: string
  - http.status_code: number
  - http.status_text: string
  - http.response.size: number
events:
  - http.error (for non-2xx responses)
```

## Monitoring Queries

### Jaeger Queries

- **Failed requests**: `error=true`
- **Slow requests**: `duration > 1s`
- **Specific tool**: `tool.name="search_and_geocode_tool"`
- **HTTP errors**: `http.status_code >= 400`

### Prometheus Metrics

Common metrics available:

- `http_requests_total` - Total HTTP requests
- `http_request_duration_seconds` - Request duration histogram
- `tool_executions_total` - Total tool executions
- `tool_execution_duration_seconds` - Tool execution time

## Integration Examples

### Docker Compose

```yaml
version: '3.8'
services:
  mcp-server:
    build: .
    environment:
      - MAPBOX_ACCESS_TOKEN=${MAPBOX_ACCESS_TOKEN}
      - OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318
      - OTEL_ENABLE_PROMETHEUS=true
    ports:
      - '9090:9090' # Prometheus metrics
    depends_on:
      - jaeger

  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - '16686:16686' # Jaeger UI
      - '4317:4317' # OTLP gRPC
      - '4318:4318' # OTLP HTTP
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-server
spec:
  template:
    spec:
      containers:
        - name: mcp-server
          image: mcp-server:latest
          env:
            - name: OTEL_EXPORTER_OTLP_ENDPOINT
              value: 'http://jaeger-collector:4318'
            - name: OTEL_ENABLE_PROMETHEUS
              value: 'true'
          ports:
            - containerPort: 9090
              name: metrics
```

### AWS ECS with X-Ray

```yaml
# ECS Task Definition
{
  'family': 'mcp-server',
  'taskRoleArn': 'arn:aws:iam::123456789012:role/mcp-server-task-role',
  'containerDefinitions':
    [
      {
        'name': 'mcp-server',
        'image': 'mcp-server:latest',
        'environment':
          [
            {
              'name': 'OTEL_EXPORTER_OTLP_ENDPOINT',
              'value': 'https://otlp.us-east-1.amazonaws.com:4318'
            },
            { 'name': 'AWS_REGION', 'value': 'us-east-1' },
            { 'name': 'OTEL_ENABLE_PROMETHEUS', 'value': 'true' }
          ],
        'portMappings': [{ 'containerPort': 9090, 'protocol': 'tcp' }]
      }
    ]
}
```

### AWS Lambda with X-Ray

For Lambda deployments, add the AWS Lambda OpenTelemetry layer:

```yaml
# SAM template
Resources:
  McpServerFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: dist/
      Handler: index.handler
      Runtime: nodejs22.x
      Layers:
        - arn:aws:lambda:us-east-1:901920570463:layer:aws-otel-nodejs-amd64-ver-1-18-1:5
      Environment:
        Variables:
          AWS_LAMBDA_EXEC_WRAPPER: /opt/otel-handler
          OTEL_EXPORTER_OTLP_ENDPOINT: https://otlp.us-east-1.amazonaws.com:4318
      Tracing: Active
```

### Grafana Dashboard

Import the included Grafana dashboard template:

```bash
# Dashboard JSON available in docs/monitoring/grafana-dashboard.json
```

## Migration from Jaeger Exporter

If you were using the deprecated Jaeger exporter, update your configuration:

**Old (deprecated):**

```bash
export JAEGER_ENDPOINT=http://localhost:14268/api/traces
```

**New (OTLP):**

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

The OTLP exporter provides:

- **Better compatibility**: Works with Jaeger, Zipkin, and other backends
- **Future-proof**: Based on OpenTelemetry standard protocol
- **Better performance**: More efficient serialization and transport
- **Enhanced features**: Support for newer OpenTelemetry features

## AWS IAM Requirements

For AWS tracing services, ensure your execution role has the necessary permissions:

### X-Ray Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["xray:PutTraceSegments", "xray:PutTelemetryRecords"],
      "Resource": "*"
    }
  ]
}
```

### CloudWatch Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    }
  ]
}
```

### Amazon Managed Prometheus

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["aps:RemoteWrite"],
      "Resource": "arn:aws:aps:*:*:workspace/*"
    }
  ]
}
```

## Troubleshooting

### Common Issues

1. **No traces appearing**

   - Check that `OTEL_EXPORTER_OTLP_ENDPOINT` is set correctly
   - Verify tracing backend is running and accessible
   - Enable console tracing to debug locally
   - For AWS: Check IAM permissions and region settings

2. **High trace volume**

   - Implement sampling in production
   - Filter out health checks and internal requests
   - Use AWS X-Ray sampling rules for cost optimization

3. **Missing HTTP spans**

   - Ensure tools are using the instrumented fetch client
   - Check that HTTP instrumentation is enabled

4. **AWS-specific issues**
   - Verify AWS credentials are configured
   - Check security groups and VPC settings
   - Ensure correct AWS region is set

### Debug Commands

```bash
# Test tracing configuration
export OTEL_ENABLE_CONSOLE_EXPORTER=true
node -e "
const { initializeTracing } = require('./dist/commonjs/utils/tracing.js');
await initializeTracing();
console.log('Tracing initialized successfully');
"

# Verify OTLP connectivity
curl -X POST ${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces \
  -H "Content-Type: application/json" \
  -d '{
    "resourceSpans": [{
      "scopeSpans": [{
        "spans": [{
          "traceId": "0123456789abcdef0123456789abcdef",
          "spanId": "0123456789abcdef",
          "name": "test-span"
        }]
      }]
    }]
  }'
```

## Performance Impact

Tracing overhead is minimal:

- **CPU**: < 1% additional overhead
- **Memory**: ~10MB for trace buffers
- **Network**: Async batched exports
- **Latency**: < 1ms per traced operation

For high-throughput production deployments, consider:

- Sampling (e.g., 10% of traces)
- Async export batching
- Resource limits on trace collection

## Privacy and Security

- **Sensitive Data**: Input parameters are not logged, only sizes
- **Access Tokens**: JWT tokens are validated but not traced
- **Network**: All exports use configurable endpoints
- **Retention**: Configure retention policies in your tracing backend

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│                 │    │                  │    │                 │
│   MCP Tools     │───▶│  Tracing Layer   │───▶│   Exporters     │
│                 │    │                  │    │                 │
│ - Search Tool   │    │ - Span Creation  │    │ - Jaeger        │
│ - Matrix Tool   │    │ - Context Mgmt   │    │ - Prometheus    │
│ - Geocode Tool  │    │ - Attributes     │    │ - Console       │
│                 │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

The tracing layer is:

- **Non-blocking**: No impact on tool performance
- **Optional**: Gracefully disabled if not configured
- **Standards-based**: Uses OpenTelemetry conventions
- **Extensible**: Easy to add custom metrics and spans
