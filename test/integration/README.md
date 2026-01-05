# Integration Tests

This directory contains integration tests that make real API calls to external services.

## Live API Monitoring

**File:** `live-api-monitoring.test.ts`

### Purpose

Detects schema drift and breaking changes in upstream Mapbox APIs by:

- Making real API calls daily
- Validating responses against our output schemas
- Automatically reporting failures via GitHub issues
- Saving problematic responses for analysis

### Why This Exists

Mapbox APIs don't follow strict semantic versioning, and responses can change without notice. This monitoring system provides early warning when schemas drift, preventing production failures.

### How It Works

**Daily Schedule:**

1. GitHub Actions runs at midnight UTC
2. Tests call Mapbox APIs with various queries
3. Responses are validated against Zod schemas
4. Failures are saved to `test/failures/`
5. A GitHub issue is created with details
6. Artifacts are uploaded for investigation

**Skipped in Regular CI:**

- Set `skipInCI = true` to avoid API rate limits
- Only runs when `RUN_API_MONITORING=true` env var is set
- GitHub Actions workflow sets this automatically

### Running Locally

```bash
# Run API monitoring tests
RUN_API_MONITORING=true npm test -- test/integration/live-api-monitoring.test.ts

# Check for failures
ls test/failures/
```

### Adding New Monitored Tools

1. Import the tool and its output schema
2. Create a new `describe.skipIf(skipInCI)` block
3. Define representative test queries/inputs
4. Follow the existing pattern for validation and failure handling

Example:

```typescript
describe.skipIf(skipInCI)('MyNewTool', () => {
  const tool = new MyNewTool({ httpRequest });

  const testInputs = [{ param: 'value1' }, { param: 'value2' }];

  it('should handle current API responses', async () => {
    const failures: ValidationFailure[] = [];

    for (const input of testInputs) {
      try {
        const result = await tool.run(input);

        if (result.isError) {
          failures.push({
            tool: 'my_new_tool',
            query: input,
            error: 'Tool returned isError=true',
            response: result,
            timestamp: new Date().toISOString()
          });
          continue;
        }

        const validation = MyToolOutputSchema.safeParse(
          result.structuredContent
        );

        if (!validation.success) {
          const failure: ValidationFailure = {
            tool: 'my_new_tool',
            query: input,
            error: validation.error.message,
            response: result.structuredContent,
            timestamp: new Date().toISOString()
          };
          failures.push(failure);

          await fs.writeFile(
            path.join(failuresDir, `mytool-${Date.now()}.json`),
            JSON.stringify(failure, null, 2)
          );
        }
      } catch (error) {
        // Handle unexpected errors
        failures.push({
          tool: 'my_new_tool',
          query: input,
          error: String(error),
          response: null,
          timestamp: new Date().toISOString()
        });
      }
    }

    if (failures.length > 0) {
      console.error('Failures:', failures);
    }

    expect(failures).toHaveLength(0);
  }, 60000);
});
```

### Responding to Failures

When a GitHub issue is created:

1. **Download artifacts** from the workflow run
2. **Review failure JSON files** to see actual API responses
3. **Identify the schema mismatch:**
   - New field added by API?
   - Field type changed?
   - Field removed?
4. **Update the output schema** to handle the new format
5. **Test locally** with saved failure response
6. **Create PR** with schema fix
7. **Close the monitoring issue** once fixed

### GitHub Actions Workflow

**File:** `.github/workflows/api-monitoring.yml`

**Triggers:**

- Daily at midnight UTC (cron schedule)
- Manual dispatch from GitHub UI

**What It Does:**

- Runs monitoring tests
- Uploads failure artifacts
- Creates GitHub issues with labels: `api-monitoring`, `schema-validation`, `needs-triage`
- Updates existing issues if multiple failures occur in one day

**Required Secrets:**

- `MAPBOX_ACCESS_TOKEN` - Valid Mapbox token for API access

### Philosophy

This complements PR #73's non-fatal validation approach:

- **PR #73** makes validation failures non-fatal (resilience)
- **API Monitoring** detects schema drift early (observability)

Together they provide:

- ✅ Resilient production behavior (users get data)
- ✅ Early warning system (maintainers notified)
- ✅ Clear evidence for schema updates (failure artifacts)
