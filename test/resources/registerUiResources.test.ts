// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi } from 'vitest';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { BaseResource } from '../../src/resources/BaseResource.js';
import { registerUiResources } from '../../src/resources/registerUiResources.js';

// registerAppResource registers through MCP Apps internals a fake server does
// not model, so capture the callback here instead.
const h = vi.hoisted(() => ({
  registered: null as null | (() => Promise<ReadResourceResult>)
}));

vi.mock('@modelcontextprotocol/ext-apps/server', () => ({
  RESOURCE_MIME_TYPE: 'text/html;profile=mcp-app',
  registerAppResource: (
    _server: any,
    _name: string,
    _uri: string,
    _metadata: any,
    handler: any
  ) => {
    h.registered = handler;
  }
}));

describe('registerUiResources', () => {
  // Reports its bound server before and after an await.
  class ObservingResource extends BaseResource {
    readonly uri = 'ui://observing';
    readonly name = 'observing_ui_resource';
    readonly description = 'Reports which server its read is bound to';
    readonly mimeType = 'text/html';

    async read(uri: string): Promise<ReadResourceResult> {
      const before = this.activeServer;
      await new Promise((resolve) => setTimeout(resolve, 0));
      const after = this.activeServer;
      return {
        contents: [
          {
            uri,
            mimeType: this.mimeType,
            text: JSON.stringify({
              before: (before as any)?.id ?? null,
              after: (after as any)?.id ?? null
            })
          }
        ]
      };
    }
  }

  it('binds the read to the server the resource was registered on', async () => {
    const resource = new ObservingResource();
    const server = { id: 'a', server: {} } as any;

    // No installTo() — registerAppResource is the only registration a ui://
    // resource gets.
    registerUiResources(server, [resource]);

    const result = await h.registered!();
    const text = (result.contents[0] as { text: string }).text;
    expect(JSON.parse(text)).toEqual({ before: 'a', after: 'a' });
  });
});
