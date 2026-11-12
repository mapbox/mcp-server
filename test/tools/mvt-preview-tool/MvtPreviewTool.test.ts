// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import {
  MvtPreviewTool,
  tileFromFileName
} from '../../../src/tools/mvt-preview-tool/MvtPreviewTool.js';
import { MVT_PREVIEW_URI } from '../../../src/resources/ui-apps/MvtPreviewUIResource.js';
import { structuredOf, textOf } from '../../utils/resultTestUtils.js';

describe('tileFromFileName', () => {
  it.each([
    ['14-9326-4739.mvt', { z: 14, x: 9326, y: 4739 }],
    ['streets_14_9326_4739.pbf', { z: 14, x: 9326, y: 4739 }],
    ['streets-v8-2-2-1.vector.pbf', { z: 2, x: 2, y: 1 }],
    ['0.0.0.mvt', { z: 0, x: 0, y: 0 }]
  ])('reads %s', (name, tile) => {
    expect(tileFromFileName(name)).toEqual(tile);
  });

  it.each(['tile.mvt', '4739.mvt', '2-4-1.mvt', '31-0-0.mvt'])(
    'finds no valid address in %s',
    (name) => {
      expect(tileFromFileName(name)).toBeUndefined();
    }
  );
});

describe('MvtPreviewTool', () => {
  it('is an app-only file entrypoint for .mvt and .pbf', () => {
    const tool = new MvtPreviewTool();
    expect(tool.meta.ui).toMatchObject({
      resourceUri: MVT_PREVIEW_URI,
      visibility: ['app']
    });
    expect(tool.meta['openai/ui']).toEqual({
      entrypoints: [{ type: 'file', extensions: ['.mvt', '.pbf'] }]
    });
  });

  it('returns the file and the tile address from its name', async () => {
    const file = { name: '14-9326-4739.mvt', resourceUri: 'host-resource://a' };
    const result = await new MvtPreviewTool().run({ file });
    expect(result.isError).toBe(false);
    expect(structuredOf(result)).toEqual({
      mvtPreview: true,
      file,
      tile: { z: 14, x: 9326, y: 4739 }
    });
    expect(textOf(result)).toContain('as tile 14/9326/4739');
  });

  it('opens a file whose name has no tile address', async () => {
    const file = { name: 'tile.pbf', resourceUri: 'host-resource://b' };
    const result = await new MvtPreviewTool().run({ file });
    expect(structuredOf(result)).toEqual({ mvtPreview: true, file });
    expect(textOf(result)).toContain('no tile address');
  });

  it('rejects a call without the file', async () => {
    const result = await new MvtPreviewTool().run({});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('{ file: { name, resourceUri } }');
  });
});
