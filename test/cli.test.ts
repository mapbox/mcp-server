// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, expect, it } from 'vitest';
import { handleCliMetadataArgs } from '../src/cli.js';

const versionInfo = {
  name: 'Mapbox MCP server',
  version: '1.2.3'
};

describe('CLI metadata arguments', () => {
  it('handles --help before server startup', () => {
    const result = handleCliMetadataArgs(['--help'], versionInfo);

    expect(result).toEqual({
      handled: true,
      exitCode: 0,
      output: expect.stringContaining('Usage: mcp-server [options]')
    });
  });

  it('handles -h before server startup', () => {
    const result = handleCliMetadataArgs(['-h'], versionInfo);

    expect(result).toEqual({
      handled: true,
      exitCode: 0,
      output: expect.stringContaining('Usage: mcp-server [options]')
    });
  });

  it('handles --version before server startup', () => {
    const result = handleCliMetadataArgs(['--version'], versionInfo);

    expect(result).toEqual({
      handled: true,
      exitCode: 0,
      output: '1.2.3\n'
    });
  });

  it('handles -v before server startup', () => {
    const result = handleCliMetadataArgs(['-v'], versionInfo);

    expect(result).toEqual({
      handled: true,
      exitCode: 0,
      output: '1.2.3\n'
    });
  });

  it('rejects unknown flags before server startup', () => {
    const result = handleCliMetadataArgs(['--bogus'], versionInfo);

    expect(result).toEqual({
      handled: true,
      exitCode: 1,
      error: 'Unknown option: --bogus\n'
    });
  });

  it('does not handle server configuration flags', () => {
    const result = handleCliMetadataArgs(
      ['--enable-tools', 'version_tool'],
      versionInfo
    );

    expect(result).toEqual({
      handled: false,
      exitCode: 0
    });
  });
});
