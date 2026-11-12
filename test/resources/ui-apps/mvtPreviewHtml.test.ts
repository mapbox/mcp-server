// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import * as vm from 'node:vm';
import { renderMvtPreviewHtml } from '../../../src/resources/ui-apps/mvtPreviewHtml.js';

describe('renderMvtPreviewHtml', () => {
  const html = renderMvtPreviewHtml({ publicToken: 'pk.test</script>' });
  const script = /<script>([\s\S]*)<\/script>/.exec(html)?.[1] ?? '';

  it('embeds a script that parses', () => {
    expect(script).toContain('function decodeMvt(');
    expect(() => new vm.Script(script)).not.toThrow();
  });

  it('escapes the token so it cannot close the script', () => {
    expect(script).toContain('"pk.test\\u003c/script>"');
  });

  it('reads the opened file through the host as a blob', () => {
    expect(script).toContain("request('resources/read'");
    expect(script).toContain("representation: 'blob'");
  });

  it('asks the host to open a path from the model', () => {
    expect(script).toContain("request('openai/files/open', { path: path }");
  });
});
