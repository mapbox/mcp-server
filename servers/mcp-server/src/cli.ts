// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

interface CliVersionInfo {
  name: string;
  version: string;
}

interface CliMetadataResult {
  handled: boolean;
  exitCode: number;
  output?: string;
  error?: string;
}

const OPTIONS = [
  '--help, -h           Show this help message',
  '--version, -v        Show the server version',
  '--enable-tools       Enable only the comma-separated tools',
  '--disable-tools      Disable the comma-separated tools'
];

const OPTIONS_WITH_VALUES = new Set(['--enable-tools', '--disable-tools']);
// --disable-mcp-ui is no longer a real option (MCP-UI support was removed
// entirely — see docs/mcp-ui.md) but stays recognized-and-ignored here, not
// in OPTIONS, so an existing launch config that still passes it keeps
// starting instead of hard-failing on "Unknown option".
const KNOWN_FLAGS = new Set([
  '--help',
  '-h',
  '--version',
  '-v',
  '--enable-tools',
  '--disable-tools',
  '--disable-mcp-ui'
]);

function formatHelp(versionInfo: CliVersionInfo): string {
  return [
    `${versionInfo.name} ${versionInfo.version}`,
    '',
    'Usage: mcp-server [options]',
    '',
    'Options:',
    ...OPTIONS.map((option) => `  ${option}`),
    ''
  ].join('\n');
}

export function handleCliMetadataArgs(
  args: string[],
  versionInfo: CliVersionInfo
): CliMetadataResult {
  if (args.includes('--help') || args.includes('-h')) {
    return {
      handled: true,
      exitCode: 0,
      output: formatHelp(versionInfo)
    };
  }

  if (args.includes('--version') || args.includes('-v')) {
    return {
      handled: true,
      exitCode: 0,
      output: `${versionInfo.version}\n`
    };
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (OPTIONS_WITH_VALUES.has(arg)) {
      i++;
      continue;
    }

    if (arg.startsWith('-') && !KNOWN_FLAGS.has(arg)) {
      return {
        handled: true,
        exitCode: 1,
        error: `Unknown option: ${arg}\n`
      };
    }
  }

  return {
    handled: false,
    exitCode: 0
  };
}
