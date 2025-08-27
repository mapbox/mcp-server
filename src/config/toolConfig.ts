import { ToolInstance } from '../tools/toolRegistry.js';

export interface ToolConfig {
  enabledTools?: string[];
  disabledTools?: string[];
}

export function parseToolConfigFromArgs(): ToolConfig {
  const args = process.argv.slice(2);
  const config: ToolConfig = {};

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
    }
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
