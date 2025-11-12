// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { ToolInstance } from '../tools/toolRegistry.js';

export interface ToolConfig {
  enabledTools?: string[];
  disabledTools?: string[];
  enableMcpUi?: boolean;
}

export function parseToolConfigFromArgs(): ToolConfig {
  const args = process.argv.slice(2);
  const config: ToolConfig = {};

  // Check environment variable first (takes precedence)
  if (process.env.ENABLE_MCP_UI !== undefined) {
    config.enableMcpUi = process.env.ENABLE_MCP_UI === 'true';
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--enable-tools') {
      const value = args[++i];
      if (value) {
        config.enabledTools = value.split(',').map((t) => t.trim());
      }
    } else if (arg === '--disable-tools') {
      const value = args[++i];
      if (value) {
        config.disabledTools = value.split(',').map((t) => t.trim());
      }
    } else if (arg === '--disable-mcp-ui') {
      // Command-line flag can disable it if env var not set
      if (config.enableMcpUi === undefined) {
        config.enableMcpUi = false;
      }
    }
  }

  // Default to true if not set (enabled by default)
  if (config.enableMcpUi === undefined) {
    config.enableMcpUi = true;
  }

  return config;
}

export function filterTools(
  tools: readonly ToolInstance[],
  config: ToolConfig
): ToolInstance[] {
  let filteredTools = [...tools];

  // If enabledTools is specified, only those tools should be enabled
  // This takes precedence over disabledTools
  if (config.enabledTools !== undefined) {
    filteredTools = filteredTools.filter((tool) =>
      config.enabledTools!.includes(tool.name)
    );
    // Return early since enabledTools takes precedence
    return filteredTools;
  }

  // Apply disabledTools filter only if enabledTools is not specified
  if (config.disabledTools && config.disabledTools.length > 0) {
    filteredTools = filteredTools.filter(
      (tool) => !config.disabledTools!.includes(tool.name)
    );
  }

  return filteredTools;
}

/**
 * Check if MCP-UI support is enabled.
 * MCP-UI is enabled by default and can be explicitly disabled via:
 * - Environment variable: ENABLE_MCP_UI=false
 * - Command-line flag: --disable-mcp-ui
 *
 * @returns true if MCP-UI is enabled (default), false if explicitly disabled
 */
export function isMcpUiEnabled(): boolean {
  // Check environment variable first (takes precedence)
  if (process.env.ENABLE_MCP_UI === 'false') {
    return false;
  }

  // Check command-line arguments
  const args = process.argv.slice(2);
  if (args.includes('--disable-mcp-ui')) {
    return false;
  }

  // Default to enabled
  return true;
}
