// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

// Load environment variables from .env file if present
// Use Node.js built-in util.parseEnv() and manually apply to override existing vars
import { parseEnv } from 'node:util';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { SpanStatusCode } from '@opentelemetry/api';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { parseToolConfigFromArgs, filterTools } from './config/toolConfig.js';
import { getCoreTools } from './tools/toolRegistry.js';
import { getAllResources } from './resources/resourceRegistry.js';
import { getAllPrompts, getPromptByName } from './prompts/promptRegistry.js';
import { getVersionInfo } from './utils/versionUtils.js';
import {
  initializeTracing,
  shutdownTracing,
  isTracingInitialized,
  getTracer
} from './utils/tracing.js';

// Load .env from current working directory (where npm run is executed)
// This happens before tracing is initialized, but we'll add a span when tracing is ready
const envPath = join(process.cwd(), '.env');
let envLoadError: Error | null = null;
let envLoadedCount = 0;

if (existsSync(envPath)) {
  try {
    // Read and parse .env file using Node.js built-in parseEnv
    const envFile = readFileSync(envPath, 'utf-8');
    const parsed = parseEnv(envFile);

    // Apply parsed values to process.env (with override)
    // Note: process.loadEnvFile() doesn't override, so we use parseEnv + manual assignment
    for (const [key, value] of Object.entries(parsed)) {
      process.env[key] = value;
      envLoadedCount++;
    }
  } catch (error) {
    envLoadError = error instanceof Error ? error : new Error(String(error));
  }
}

const versionInfo = getVersionInfo();

// Parse configuration from command-line arguments
const config = parseToolConfigFromArgs();

// Get and filter tools based on configuration
const coreTools = getCoreTools();
const enabledCoreTools = filterTools(coreTools, config);

// Get all resources
const allResources = getAllResources();

// Create an MCP server
const server = new McpServer(
  {
    name: versionInfo.name,
    version: versionInfo.version,
    icons: [
      {
        src: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDIxLjAuMiwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9Im5ldyIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgeD0iMHB4IiB5PSIwcHgiCgkgdmlld0JveD0iMCAwIDgwMCAxODAiIHN0eWxlPSJlbmFibGUtYmFja2dyb3VuZDpuZXcgMCAwIDgwMCAxODA7IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KPHRpdGxlPk1hcGJveF9Mb2dvXzA4PC90aXRsZT4KPGc+Cgk8Zz4KCQk8cGF0aCBkPSJNNTk0LjYsNDkuOGMtOS45LDAtMTkuNCw0LjEtMjYuMywxMS4zVjIzYzAtMS4yLTEtMi4yLTIuMi0yLjJsMCwwaC0xMy40Yy0xLjIsMC0yLjIsMS0yLjIsMi4ydjEwM2MwLDEuMiwxLDIuMiwyLjIsMi4yCgkJCWgxMy40YzEuMiwwLDIuMi0xLDIuMi0yLjJ2MHYtNy4xYzYuOSw3LjIsMTYuMywxMS4zLDI2LjMsMTEuM2MyMC45LDAsMzcuOC0xOCwzNy44LTQwLjJTNjE1LjUsNDkuOCw1OTQuNiw0OS44eiBNNTkxLjUsMTE0LjEKCQkJYy0xMi43LDAtMjMtMTAuNi0yMy4xLTIzLjh2LTAuNmMwLjItMTMuMiwxMC40LTIzLjgsMjMuMS0yMy44YzEyLjgsMCwyMy4xLDEwLjgsMjMuMSwyNC4xUzYwNC4yLDExNC4xLDU5MS41LDExNC4xTDU5MS41LDExNC4xeiIKCQkJLz4KCQk8cGF0aCBkPSJNNjgxLjcsNDkuOGMtMjIuNiwwLTQwLjksMTgtNDAuOSw0MC4yczE4LjMsNDAuMiw0MC45LDQwLjJjMjIuNiwwLDQwLjktMTgsNDAuOS00MC4yUzcwNC4zLDQ5LjgsNjgxLjcsNDkuOHoKCQkJIE02ODEuNiwxMTQuMWMtMTIuOCwwLTIzLjEtMTAuOC0yMy4xLTI0LjFzMTAuNC0yNC4xLDIzLjEtMjQuMXMyMy4xLDEwLjgsMjMuMSwyNC4xUzY5NC4zLDExNC4xLDY4MS42LDExNC4xTDY4MS42LDExNC4xeiIvPgoJCTxwYXRoIGQ9Ik00MzEuNiw1MS44aC0xMy40Yy0xLjIsMC0yLjIsMS0yLjIsMi4yYzAsMCwwLDAsMCwwdjcuMWMtNi45LTcuMi0xNi4zLTExLjMtMjYuMy0xMS4zYy0yMC45LDAtMzcuOCwxOC0zNy44LDQwLjIKCQkJczE2LjksNDAuMiwzNy44LDQwLjJjOS45LDAsMTkuNC00LjEsMjYuMy0xMS4zdjcuMWMwLDEuMiwxLDIuMiwyLjIsMi4ybDAsMGgxMy40YzEuMiwwLDIuMi0xLDIuMi0yLjJ2MFY1NAoJCQlDNDMzLjgsNTIuOCw0MzIuOCw1MS44LDQzMS42LDUxLjh6IE0zOTIuOCwxMTQuMWMtMTIuOCwwLTIzLjEtMTAuOC0yMy4xLTI0LjFzMTAuNC0yNC4xLDIzLjEtMjQuMWMxMi43LDAsMjMsMTAuNiwyMy4xLDIzLjh2MC42CgkJCUM0MTUuOCwxMDMuNSw0MDUuNSwxMTQuMSwzOTIuOCwxMTQuMUwzOTIuOCwxMTQuMXoiLz4KCQk8cGF0aCBkPSJNNDk4LjUsNDkuOGMtOS45LDAtMTkuNCw0LjEtMjYuMywxMS4zVjU0YzAtMS4yLTEtMi4yLTIuMi0yLjJsMCwwaC0xMy40Yy0xLjIsMC0yLjIsMS0yLjIsMi4yYzAsMCwwLDAsMCwwdjEwMwoJCQljMCwxLjIsMSwyLjIsMi4yLDIuMmwwLDBoMTMuNGMxLjIsMCwyLjItMSwyLjItMi4ydjB2LTM4LjFjNi45LDcuMiwxNi4zLDExLjMsMjYuMywxMS4zYzIwLjksMCwzNy44LTE4LDM3LjgtNDAuMgoJCQlTNTE5LjQsNDkuOCw0OTguNSw0OS44eiBNNDk1LjQsMTE0LjFjLTEyLjcsMC0yMy0xMC42LTIzLjEtMjMuOHYtMC42YzAuMi0xMy4yLDEwLjQtMjMuOCwyMy4xLTIzLjhjMTIuOCwwLDIzLjEsMTAuOCwyMy4xLDI0LjEKCQkJUzUwOC4yLDExNC4xLDQ5NS40LDExNC4xTDQ5NS40LDExNC4xeiIvPgoJCTxwYXRoIGQ9Ik0zMTEuOCw0OS44Yy0xMCwwLjEtMTkuMSw1LjktMjMuNCwxNWMtNC45LTkuMy0xNC43LTE1LjEtMjUuMi0xNWMtOC4yLDAtMTUuOSw0LTIwLjcsMTAuNlY1NGMwLTEuMi0xLTIuMi0yLjItMi4ybDAsMAoJCQloLTEzLjRjLTEuMiwwLTIuMiwxLTIuMiwyLjJjMCwwLDAsMCwwLDB2NzJjMCwxLjIsMSwyLjIsMi4yLDIuMmgwaDEzLjRjMS4yLDAsMi4yLTEsMi4yLTIuMnYwVjgyLjljMC41LTkuNiw3LjItMTcuMywxNS40LTE3LjMKCQkJYzguNSwwLDE1LjYsNy4xLDE1LjYsMTYuNHY0NGMwLDEuMiwxLDIuMiwyLjIsMi4ybDEzLjUsMGMxLjIsMCwyLjItMSwyLjItMi4yYzAsMCwwLDAsMCwwbC0wLjEtNDQuOGMxLjItOC44LDcuNS0xNS42LDE1LjItMTUuNgoJCQljOC41LDAsMTUuNiw3LjEsMTUuNiwxNi40djQ0YzAsMS4yLDEsMi4yLDIuMiwyLjJsMTMuNSwwYzEuMiwwLDIuMi0xLDIuMi0yLjJjMCwwLDAsMCwwLDBsLTAuMS00OS41CgkJCUMzMzkuOSw2MS43LDMyNy4zLDQ5LjgsMzExLjgsNDkuOHoiLz4KCQk8cGF0aCBkPSJNNzk0LjcsMTI1LjFsLTIzLjItMzUuM2wyMy0zNWMwLjYtMC45LDAuMy0yLjItMC42LTIuOGMtMC4zLTAuMi0wLjctMC4zLTEuMS0wLjNoLTE1LjVjLTEuMiwwLTIuMywwLjYtMi45LDEuNkw3NjAuOSw3NgoJCQlsLTEzLjUtMjIuNmMtMC42LTEtMS43LTEuNi0yLjktMS42aC0xNS41Yy0xLjEsMC0yLDAuOS0yLDJjMCwwLjQsMC4xLDAuOCwwLjMsMS4xbDIzLDM1bC0yMy4yLDM1LjNjLTAuNiwwLjktMC4zLDIuMiwwLjYsMi44CgkJCWMwLjMsMC4yLDAuNywwLjMsMS4xLDAuM2gxNS41YzEuMiwwLDIuMy0wLjYsMi45LTEuNmwxMy44LTIzbDEzLjgsMjNjMC42LDEsMS43LDEuNiwyLjksMS42SDc5M2MxLjEsMCwyLTAuOSwyLTIKCQkJQzc5NSwxMjUuOSw3OTQuOSwxMjUuNSw3OTQuNywxMjUuMXoiLz4KCTwvZz4KCTxnPgoJCTxwYXRoIGQ9Ik05My45LDEuMUM0NC44LDEuMSw1LDQwLjksNSw5MHMzOS44LDg4LjksODguOSw4OC45czg4LjktMzkuOCw4OC45LTg4LjlDMTgyLjgsNDAuOSwxNDMsMS4xLDkzLjksMS4xeiBNMTM2LjEsMTExLjgKCQkJYy0zMC40LDMwLjQtODQuNywyMC43LTg0LjcsMjAuN3MtOS44LTU0LjIsMjAuNy04NC43Qzg5LDMwLjksMTE3LDMxLjYsMTM0LjcsNDkuMlMxNTMsOTQuOSwxMzYuMSwxMTEuOEwxMzYuMSwxMTEuOHoiLz4KCQk8cG9seWdvbiBwb2ludHM9IjEwNC4xLDUzLjIgOTUuNCw3MS4xIDc3LjUsNzkuOCA5NS40LDg4LjUgMTA0LjEsMTA2LjQgMTEyLjgsODguNSAxMzAuNyw3OS44IDExMi44LDcxLjEgCQkiLz4KCTwvZz4KPC9nPgo8L3N2Zz4K',
        mimeType: 'image/svg+xml',
        sizes: ['800x180'],
        theme: 'light'
      },
      {
        src: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDIxLjAuMiwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9Im5ldyIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayIgeD0iMHB4IiB5PSIwcHgiCgkgdmlld0JveD0iMCAwIDgwMCAxODAiIHN0eWxlPSJlbmFibGUtYmFja2dyb3VuZDpuZXcgMCAwIDgwMCAxODA7IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KPHN0eWxlIHR5cGU9InRleHQvY3NzIj4KCS5zdDB7ZmlsbDojRkZGRkZGO30KPC9zdHlsZT4KPHRpdGxlPk1hcGJveF9Mb2dvXzA4PC90aXRsZT4KPGc+Cgk8Zz4KCQk8cGF0aCBjbGFzcz0ic3QwIiBkPSJNNTk0LjYsNDkuOGMtOS45LDAtMTkuNCw0LjEtMjYuMywxMS4zVjIzYzAtMS4yLTEtMi4yLTIuMi0yLjJsMCwwaC0xMy40Yy0xLjIsMC0yLjIsMS0yLjIsMi4ydjEwMwoJCQljMCwxLjIsMSwyLjIsMi4yLDIuMmgxMy40YzEuMiwwLDIuMi0xLDIuMi0yLjJ2MHYtNy4xYzYuOSw3LjIsMTYuMywxMS4zLDI2LjMsMTEuM2MyMC45LDAsMzcuOC0xOCwzNy44LTQwLjIKCQkJUzYxNS41LDQ5LjgsNTk0LjYsNDkuOHogTTU5MS41LDExNC4xYy0xMi43LDAtMjMtMTAuNi0yMy4xLTIzLjh2LTAuNmMwLjItMTMuMiwxMC40LTIzLjgsMjMuMS0yMy44YzEyLjgsMCwyMy4xLDEwLjgsMjMuMSwyNC4xCgkJCVM2MDQuMiwxMTQuMSw1OTEuNSwxMTQuMUw1OTEuNSwxMTQuMXoiLz4KCQk8cGF0aCBjbGFzcz0ic3QwIiBkPSJNNjgxLjcsNDkuOGMtMjIuNiwwLTQwLjksMTgtNDAuOSw0MC4yczE4LjMsNDAuMiw0MC45LDQwLjJjMjIuNiwwLDQwLjktMTgsNDAuOS00MC4yUzcwNC4zLDQ5LjgsNjgxLjcsNDkuOHoKCQkJIE02ODEuNiwxMTQuMWMtMTIuOCwwLTIzLjEtMTAuOC0yMy4xLTI0LjFzMTAuNC0yNC4xLDIzLjEtMjQuMXMyMy4xLDEwLjgsMjMuMSwyNC4xUzY5NC4zLDExNC4xLDY4MS42LDExNC4xTDY4MS42LDExNC4xeiIvPgoJCTxwYXRoIGNsYXNzPSJzdDAiIGQ9Ik00MzEuNiw1MS44aC0xMy40Yy0xLjIsMC0yLjIsMS0yLjIsMi4yYzAsMCwwLDAsMCwwdjcuMWMtNi45LTcuMi0xNi4zLTExLjMtMjYuMy0xMS4zCgkJCWMtMjAuOSwwLTM3LjgsMTgtMzcuOCw0MC4yczE2LjksNDAuMiwzNy44LDQwLjJjOS45LDAsMTkuNC00LjEsMjYuMy0xMS4zdjcuMWMwLDEuMiwxLDIuMiwyLjIsMi4ybDAsMGgxMy40YzEuMiwwLDIuMi0xLDIuMi0yLjIKCQkJdjBWNTRDNDMzLjgsNTIuOCw0MzIuOCw1MS44LDQzMS42LDUxLjh6IE0zOTIuOCwxMTQuMWMtMTIuOCwwLTIzLjEtMTAuOC0yMy4xLTI0LjFzMTAuNC0yNC4xLDIzLjEtMjQuMWMxMi43LDAsMjMsMTAuNiwyMy4xLDIzLjgKCQkJdjAuNkM0MTUuOCwxMDMuNSw0MDUuNSwxMTQuMSwzOTIuOCwxMTQuMUwzOTIuOCwxMTQuMXoiLz4KCQk8cGF0aCBjbGFzcz0ic3QwIiBkPSJNNDk4LjUsNDkuOGMtOS45LDAtMTkuNCw0LjEtMjYuMywxMS4zVjU0YzAtMS4yLTEtMi4yLTIuMi0yLjJsMCwwaC0xMy40Yy0xLjIsMC0yLjIsMS0yLjIsMi4yYzAsMCwwLDAsMCwwCgkJCXYxMDNjMCwxLjIsMSwyLjIsMi4yLDIuMmwwLDBoMTMuNGMxLjIsMCwyLjItMSwyLjItMi4ydjB2LTM4LjFjNi45LDcuMiwxNi4zLDExLjMsMjYuMywxMS4zYzIwLjksMCwzNy44LTE4LDM3LjgtNDAuMgoJCQlTNTE5LjQsNDkuOCw0OTguNSw0OS44eiBNNDk1LjQsMTE0LjFjLTEyLjcsMC0yMy0xMC42LTIzLjEtMjMuOHYtMC42YzAuMi0xMy4yLDEwLjQtMjMuOCwyMy4xLTIzLjhjMTIuOCwwLDIzLjEsMTAuOCwyMy4xLDI0LjEKCQkJUzUwOC4yLDExNC4xLDQ5NS40LDExNC4xTDQ5NS40LDExNC4xeiIvPgoJCTxwYXRoIGNsYXNzPSJzdDAiIGQ9Ik0zMTEuOCw0OS44Yy0xMCwwLjEtMTkuMSw1LjktMjMuNCwxNWMtNC45LTkuMy0xNC43LTE1LjEtMjUuMi0xNWMtOC4yLDAtMTUuOSw0LTIwLjcsMTAuNlY1NAoJCQljMC0xLjItMS0yLjItMi4yLTIuMmwwLDBoLTEzLjRjLTEuMiwwLTIuMiwxLTIuMiwyLjJjMCwwLDAsMCwwLDB2NzJjMCwxLjIsMSwyLjIsMi4yLDIuMmgwaDEzLjRjMS4yLDAsMi4yLTEsMi4yLTIuMnYwVjgyLjkKCQkJYzAuNS05LjYsNy4yLTE3LjMsMTUuNC0xNy4zYzguNSwwLDE1LjYsNy4xLDE1LjYsMTYuNHY0NGMwLDEuMiwxLDIuMiwyLjIsMi4ybDEzLjUsMGMxLjIsMCwyLjItMSwyLjItMi4yYzAsMCwwLDAsMCwwbC0wLjEtNDQuOAoJCQljMS4yLTguOCw3LjUtMTUuNiwxNS4yLTE1LjZjOC41LDAsMTUuNiw3LjEsMTUuNiwxNi40djQ0YzAsMS4yLDEsMi4yLDIuMiwyLjJsMTMuNSwwYzEuMiwwLDIuMi0xLDIuMi0yLjJjMCwwLDAsMCwwLDBsLTAuMS00OS41CgkJCUMzMzkuOSw2MS43LDMyNy4zLDQ5LjgsMzExLjgsNDkuOHoiLz4KCQk8cGF0aCBjbGFzcz0ic3QwIiBkPSJNNzk0LjcsMTI1LjFsLTIzLjItMzUuM2wyMy0zNWMwLjYtMC45LDAuMy0yLjItMC42LTIuOGMtMC4zLTAuMi0wLjctMC4zLTEuMS0wLjNoLTE1LjUKCQkJYy0xLjIsMC0yLjMsMC42LTIuOSwxLjZMNzYwLjksNzZsLTEzLjUtMjIuNmMtMC42LTEtMS43LTEuNi0yLjktMS42aC0xNS41Yy0xLjEsMC0yLDAuOS0yLDJjMCwwLjQsMC4xLDAuOCwwLjMsMS4xbDIzLDM1CgkJCWwtMjMuMiwzNS4zYy0wLjYsMC45LTAuMywyLjIsMC42LDIuOGMwLjMsMC4yLDAuNywwLjMsMS4xLDAuM2gxNS41YzEuMiwwLDIuMy0wLjYsMi45LTEuNmwxMy44LTIzbDEzLjgsMjNjMC42LDEsMS43LDEuNiwyLjksMS42CgkJCUg3OTNjMS4xLDAsMi0wLjksMi0yQzc5NSwxMjUuOSw3OTQuOSwxMjUuNSw3OTQuNywxMjUuMXoiLz4KCTwvZz4KCTxnPgoJCTxwYXRoIGNsYXNzPSJzdDAiIGQ9Ik05My45LDEuMUM0NC44LDEuMSw1LDQwLjksNSw5MHMzOS44LDg4LjksODguOSw4OC45czg4LjktMzkuOCw4OC45LTg4LjlDMTgyLjgsNDAuOSwxNDMsMS4xLDkzLjksMS4xegoJCQkgTTEzNi4xLDExMS44Yy0zMC40LDMwLjQtODQuNywyMC43LTg0LjcsMjAuN3MtOS44LTU0LjIsMjAuNy04NC43Qzg5LDMwLjksMTE3LDMxLjYsMTM0LjcsNDkuMlMxNTMsOTQuOSwxMzYuMSwxMTEuOEwxMzYuMSwxMTEuOAoJCQl6Ii8+CgkJPHBvbHlnb24gY2xhc3M9InN0MCIgcG9pbnRzPSIxMDQuMSw1My4yIDk1LjQsNzEuMSA3Ny41LDc5LjggOTUuNCw4OC41IDEwNC4xLDEwNi40IDExMi44LDg4LjUgMTMwLjcsNzkuOCAxMTIuOCw3MS4xIAkJIi8+Cgk8L2c+CjwvZz4KPC9zdmc+Cg==',
        mimeType: 'image/svg+xml',
        sizes: ['800x180'],
        theme: 'dark'
      }
    ]
  },
  {
    capabilities: {
      tools: {
        listChanged: true // Advertise support for dynamic tool registration (ready for future capability-dependent tools)
      },
      resources: {},
      prompts: {}
    }
  }
);

// Register only core tools before connection
// Capability-dependent tools will be registered dynamically after connection
enabledCoreTools.forEach((tool) => {
  tool.installTo(server);
});

// Register all resources to the server
allResources.forEach((resource) => {
  resource.installTo(server);
});

// Register prompt handlers
server.server.setRequestHandler(ListPromptsRequestSchema, async () => {
  const allPrompts = getAllPrompts();
  return {
    prompts: allPrompts.map((prompt) => prompt.getMetadata())
  };
});

// Type assertion to avoid "Type instantiation is excessively deep" error
// This is a known issue in MCP SDK 1.25.1: https://github.com/modelcontextprotocol/typescript-sdk/issues/985
// TODO: Remove this workaround when SDK fixes their type definitions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(server.server as any).setRequestHandler(
  GetPromptRequestSchema,
  async (request: any) => {
    const { name, arguments: args } = request.params;

    const prompt = getPromptByName(name);
    if (!prompt) {
      throw new Error(`Prompt not found: ${name}`);
    }

    // Convert args to object for easier access
    const argsObj: Record<string, string> = {};
    if (args && typeof args === 'object') {
      Object.assign(argsObj, args);
    }

    // Get the prompt messages with filled-in arguments
    const messages = prompt.getMessages(argsObj);

    return {
      description: prompt.description,
      messages
    };
  }
);

async function main() {
  // Initialize OpenTelemetry tracing if not in test mode
  let tracingInitialized = false;
  if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
    try {
      await initializeTracing();
      tracingInitialized = isTracingInitialized();

      // Record .env loading as a span (retrospectively since it happened before tracing init)
      if (tracingInitialized) {
        const tracer = getTracer();
        const span = tracer.startSpan('config.load_env', {
          attributes: {
            'config.file.path': envPath,
            'config.file.exists': existsSync(envPath),
            'config.vars.loaded': envLoadedCount,
            'operation.type': 'config_load'
          }
        });

        if (envLoadError) {
          span.recordException(envLoadError);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: envLoadError.message
          });
          span.setAttribute('error.type', envLoadError.name);
          span.setAttribute('error.message', envLoadError.message);
        } else if (envLoadedCount > 0) {
          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttribute('config.load.success', true);
        } else {
          // No error, but no variables loaded either (file might be empty or not exist)
          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttribute('config.load.success', true);
          span.setAttribute('config.load.empty', true);
        }

        span.end();
      }
    } catch (error) {
      // Tracing initialization failed, log it but continue without tracing
      server.server.sendLoggingMessage({
        level: 'warning',
        data: `Failed to initialize tracing: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  // Log tracing status and configuration
  if (tracingInitialized) {
    const tracingConfig = {
      status: 'enabled',
      endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'not set',
      serviceName:
        process.env.OTEL_SERVICE_NAME || 'mapbox-mcp-server (default)'
    };
    server.server.sendLoggingMessage({
      level: 'info',
      data: `OpenTelemetry tracing enabled - Endpoint: ${tracingConfig.endpoint}, Service: ${tracingConfig.serviceName}`
    });
  } else {
    server.server.sendLoggingMessage({
      level: 'info',
      data: 'OpenTelemetry tracing: disabled'
    });
  }

  // Send MCP logging message about environment variables
  if (envLoadError) {
    server.server.sendLoggingMessage({
      level: 'warning',
      data: `Warning loading .env file: ${envLoadError.message}`
    });
  } else if (envLoadedCount > 0) {
    server.server.sendLoggingMessage({
      level: 'info',
      data: `Loaded ${envLoadedCount} environment variables from ${envPath}`
    });
  }

  const relevantEnvVars = Object.freeze({
    MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN ? '***' : undefined,
    MAPBOX_API_ENDPOINT: process.env.MAPBOX_API_ENDPOINT,
    OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME,
    OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    OTEL_TRACING_ENABLED: process.env.OTEL_TRACING_ENABLED,
    NODE_ENV: process.env.NODE_ENV
  });

  server.server.sendLoggingMessage({
    level: 'debug',
    data: JSON.stringify(relevantEnvVars, null, 2)
  });

  // Start receiving messages on stdin and sending messages on stdout
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Note: Dynamic tool registration based on client capabilities is ready for use.
  // Currently all tools are in CORE_TOOLS since this server doesn't have
  // capability-dependent tools yet. When adding tools that require specific
  // capabilities (like elicitation), follow the pattern used in mcp-devkit-server:
  // 1. Categorize tools by capability requirements
  // 2. Register core tools before connection
  // 3. After connection, check client capabilities
  // 4. Dynamically register capability-dependent tools
  // 5. Send sendToolListChanged() notification
}

// Ensure cleanup interval is cleared when the process exits
async function shutdown() {
  // Shutdown tracing
  try {
    await shutdownTracing();
  } catch (error) {
    // Tracing shutdown failed, log via MCP if server is available
    try {
      server.server.sendLoggingMessage({
        level: 'error',
        data: `Error shutting down tracing: ${error instanceof Error ? error.message : String(error)}`
      });
    } catch {
      // Server not available, ignore
    }
  }

  process.exit(0);
}

function exitWithLog(message: string, error: unknown, code = 1) {
  // Log error via MCP server if available
  try {
    server.server.sendLoggingMessage({
      level: 'error',
      data: `${message}: ${error instanceof Error ? error.message : String(error)}`
    });
  } catch {
    // Server not available, ignore
  }
  process.exit(code);
}

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, async () => {
    try {
      await shutdown();
    } finally {
      process.exit(0);
    }
  });
});

process.on('uncaughtException', (err) =>
  exitWithLog('Uncaught exception:', err)
);
process.on('unhandledRejection', (reason) =>
  exitWithLog('Unhandled rejection:', reason)
);

main().catch((error) => exitWithLog('Fatal error starting MCP server:', error));
