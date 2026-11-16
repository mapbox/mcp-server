import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Import the pure functions from the pack check script
const { checkPackCore, entryPoints } = require('../../scripts/check-pack.cjs');

const packageJson = {
  name: '@mapbox/test-server',
  bin: { 'test-server': 'dist/esm/index.js' },
  exports: {
    '.': {
      import: {
        types: './dist/esm/index.d.ts',
        default: './dist/esm/index.js'
      },
      require: {
        types: './dist/commonjs/index.d.ts',
        default: './dist/commonjs/index.js'
      }
    },
    './tools': {
      import: {
        types: './dist/esm/tools/index.d.ts',
        default: './dist/esm/tools/index.js'
      }
    }
  }
};

const packedFiles = [
  'package.json',
  'README.md',
  'dist/esm/index.js',
  'dist/esm/index.d.ts',
  'dist/commonjs/index.js',
  'dist/commonjs/index.d.ts',
  'dist/esm/tools/index.js',
  'dist/esm/tools/index.d.ts'
];

describe('check-pack.cjs - entryPoints', () => {
  it('collects every exports target and the bin, without duplicates', () => {
    expect(entryPoints(packageJson)).toEqual([
      'dist/commonjs/index.d.ts',
      'dist/commonjs/index.js',
      'dist/esm/index.d.ts',
      'dist/esm/index.js',
      'dist/esm/tools/index.d.ts',
      'dist/esm/tools/index.js'
    ]);
  });

  it('takes a string bin, main, types and module', () => {
    expect(
      entryPoints({
        bin: './cli.js',
        main: 'index.js',
        types: 'index.d.ts',
        module: 'index.mjs'
      })
    ).toEqual(['cli.js', 'index.d.ts', 'index.js', 'index.mjs']);
  });

  it('skips wildcard exports, which point at no single file', () => {
    expect(entryPoints({ exports: { './*': './dist/*.js' } })).toEqual([]);
  });
});

describe('check-pack.cjs - checkPackCore', () => {
  it('passes when the package matches the latest published version', () => {
    const result = checkPackCore(packageJson, packedFiles, packedFiles);

    expect(result.ok).toBe(true);
    expect(result.missingEntryPoints).toEqual([]);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it('fails when an entry point is not packed', () => {
    const result = checkPackCore(
      packageJson,
      packedFiles.filter((file) => file !== 'dist/commonjs/index.d.ts'),
      null
    );

    expect(result.ok).toBe(false);
    expect(result.missingEntryPoints).toEqual(['dist/commonjs/index.d.ts']);
  });

  it('fails when a published file is gone', () => {
    const published = [...packedFiles, 'dist/esm/tools/old-tool/OldTool.js'];

    const result = checkPackCore(packageJson, packedFiles, published);

    expect(result.ok).toBe(false);
    expect(result.removed).toEqual(['dist/esm/tools/old-tool/OldTool.js']);
  });

  it('passes with removed files when they are allowed', () => {
    const published = [...packedFiles, 'dist/esm/tools/old-tool/OldTool.js'];

    const result = checkPackCore(packageJson, packedFiles, published, {
      allowRemoved: true
    });

    expect(result.ok).toBe(true);
    expect(result.removed).toEqual(['dist/esm/tools/old-tool/OldTool.js']);
  });

  it('still fails on a missing entry point when removed files are allowed', () => {
    const result = checkPackCore(
      packageJson,
      packedFiles.filter((file) => file !== 'dist/esm/index.js'),
      packedFiles,
      { allowRemoved: true }
    );

    expect(result.ok).toBe(false);
    expect(result.missingEntryPoints).toEqual(['dist/esm/index.js']);
  });

  it('lists added files without failing', () => {
    const result = checkPackCore(
      packageJson,
      [...packedFiles, 'dist/esm/tools/new-tool/NewTool.js'],
      packedFiles
    );

    expect(result.ok).toBe(true);
    expect(result.added).toEqual(['dist/esm/tools/new-tool/NewTool.js']);
  });

  it('only checks entry points for a package that has not been published', () => {
    const result = checkPackCore(packageJson, packedFiles, null);

    expect(result.ok).toBe(true);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
  });
});
