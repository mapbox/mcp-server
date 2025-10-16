# Trace Context Propagation in MCP Server

This document explains how traces are connected throughout the system from tool execution to HTTP requests.

## 🔗 **Trace Context Flow**

```
MCP Tool Execution Span (Root)
├── Tool Business Logic
├── HTTP Request Span (Child)
    ├── Network Request
    └── Response Processing
```

## 🎯 **Context Propagation Mechanism**

### 1. **HTTP Pipeline Context**

```typescript
// In TracingPolicy.handle()
return context.with(trace.setSpan(context.active(), span), async () => {
  const response = await next(input, init);
  // ... process response
  return response;
});
```

## 🔧 **Key Implementation Details**

### Context Propagation APIs Used

- `context.with()`: Executes code within a specific context
- `trace.setSpan()`: Sets the active span in the context
- `context.active()`: Gets the current active context

### Automatic Instrumentation

- **HTTP calls**: Automatically instrumented by `@opentelemetry/instrumentation-http`
- **Custom spans**: Created for business logic and enhanced with metadata

## 📊 **Resulting Trace Structure**

### Example Trace Hierarchy:

```
🔄 reverse_geocode_tool (16.4s)
├── 🌐 HTTP GET api.mapbox.com/search (125ms)
│   ├── http.method: GET
│   ├── http.status_code: 200
│   └── http.response.content_length: 2048
└── 📄 Result formatting (50ms)
```

### Span Attributes Connected:

- **Tool context**: `tool.name`, `tool.input.size`
- **HTTP context**: `http.method`, `http.url`, `http.status_code`
- **Session context**: `session.id`, `user.id` (when available)

## 🚀 **Benefits of Connected Traces**

### 1. **End-to-End Visibility**

- See complete request flow from tool invocation to API responses
- Identify bottlenecks in the request chain
- Track errors and their propagation

### 2. **Cost Attribution**

- Track which tools are most expensive
- Monitor usage patterns by user/session

### 3. **Performance Analysis**

- Identify slow HTTP requests
- Optimize tool execution paths

### 4. **Error Correlation**

- See which HTTP failures cause tool failures
- Debug complex multi-service interactions

## 🔍 **Querying Connected Traces**

### Find slow HTTP requests in tool context:

```
span.name CONTAINS "HTTP" AND duration > 1000ms
```

## 🛠 **Configuration**

### Required Environment Variables:

```bash
# Enable tracing
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# Optional: Enable console output for debugging
OTEL_EXPORTER_CONSOLE_ENABLED=true
```

### Trace Sampling:

The system uses default sampling (100% in dev, configurable in prod) to ensure all traces are connected properly.

This architecture ensures that every HTTP request can be traced back to the originating tool execution, providing complete observability! 🎉
