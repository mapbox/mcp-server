// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TemporaryDataResource } from '../../../src/resources/temporary/TemporaryDataResource.js';
import { temporaryResourceManager } from '../../../src/utils/temporaryResourceManager.js';

// Build a Mapbox-style 3-part JWT whose payload carries the username (`u`).
function tokenFor(username: string): string {
  const payload = Buffer.from(JSON.stringify({ u: username })).toString(
    'base64'
  );
  return `pk.${payload}.sig`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extraFor(token?: string): any {
  return token ? { authInfo: { token } } : {};
}

const NOT_FOUND =
  'Resource not found or expired. Temporary resources have a 30-minute TTL.';

describe('TemporaryDataResource — AGI-890 cross-account access control', () => {
  let resource: TemporaryDataResource;
  let savedEnvToken: string | undefined;

  beforeEach(() => {
    temporaryResourceManager.clear();
    resource = new TemporaryDataResource();
    savedEnvToken = process.env.MAPBOX_ACCESS_TOKEN;
    delete process.env.MAPBOX_ACCESS_TOKEN;
  });

  afterEach(() => {
    temporaryResourceManager.clear();
    if (savedEnvToken !== undefined) {
      process.env.MAPBOX_ACCESS_TOKEN = savedEnvToken;
    } else {
      delete process.env.MAPBOX_ACCESS_TOKEN;
    }
  });

  function seedTextResource(uri: string, owner: string, data: unknown) {
    temporaryResourceManager.create({
      id: 'id',
      uri,
      data,
      metadata: { toolName: 'directions_tool' },
      owner
    });
  }

  it('lets the creating account read its own resource', async () => {
    const uri = 'mapbox://temp/directions-aaa';
    seedTextResource(uri, 'accountA', { route: 'A-secret-geometry' });

    const result = await resource.read(uri, extraFor(tokenFor('accountA')));
    const text = result.contents[0].text as string;

    expect(text).toContain('A-secret-geometry');
  });

  it('does NOT return another account’s resource body (regression)', async () => {
    const uri = 'mapbox://temp/directions-bbb';
    seedTextResource(uri, 'accountA', { route: 'A-secret-geometry' });

    const result = await resource.read(uri, extraFor(tokenFor('accountB')));
    const text = result.contents[0].text as string;

    expect(text).toBe(NOT_FOUND);
    expect(text).not.toContain('A-secret-geometry');
  });

  it('returns an identical response for "not yours" and "does not exist" (no existence oracle)', async () => {
    const ownedUri = 'mapbox://temp/directions-ccc';
    seedTextResource(ownedUri, 'accountA', { route: 'A-secret-geometry' });

    const crossAccount = await resource.read(
      ownedUri,
      extraFor(tokenFor('accountB'))
    );
    const missing = await resource.read(
      'mapbox://temp/directions-does-not-exist',
      extraFor(tokenFor('accountB'))
    );

    // The only field that differs is the echoed-back request URI (caller's own
    // input, not an existence signal). The mimeType and message are identical,
    // so a caller cannot distinguish "not yours" from "does not exist".
    expect(crossAccount.contents[0].mimeType).toBe(
      missing.contents[0].mimeType
    );
    expect(crossAccount.contents[0].text).toBe(missing.contents[0].text);
    expect(crossAccount.contents[0].text).toBe(NOT_FOUND);
  });

  it('fails closed when the reader has no token', async () => {
    const uri = 'mapbox://temp/directions-ddd';
    seedTextResource(uri, 'accountA', { route: 'A-secret-geometry' });

    const result = await resource.read(uri, extraFor(undefined));
    expect(result.contents[0].text).toBe(NOT_FOUND);
  });

  it('fails closed when the resource has no owner recorded', async () => {
    const uri = 'mapbox://temp/directions-eee';
    // No owner -> owner undefined
    temporaryResourceManager.create({
      id: uri,
      uri,
      data: { route: 'legacy' }
    });

    const result = await resource.read(uri, extraFor(tokenFor('accountA')));
    expect(result.contents[0].text).toBe(NOT_FOUND);
  });

  it('falls back to the env token so stdio/single-user reads still work', async () => {
    const envToken = tokenFor('localuser');
    process.env.MAPBOX_ACCESS_TOKEN = envToken;
    const uri = 'mapbox://temp/directions-fff';
    seedTextResource(uri, 'localuser', { route: 'local-data' });

    // No authInfo on the request (stdio) -> requester resolved from env token.
    const result = await resource.read(uri, extraFor(undefined));
    expect(result.contents[0].text as string).toContain('local-data');
  });

  it('returns image blobs to the owner and not-found to others', async () => {
    const uri = 'mapbox://temp/static-map-ggg';
    temporaryResourceManager.create({
      id: 'imgid',
      uri,
      data: 'BASE64IMAGEDATA',
      metadata: { toolName: 'static_map_image_tool' },
      mimeType: 'image/png',
      owner: 'accountA'
    });

    const owner = await resource.read(uri, extraFor(tokenFor('accountA')));
    expect(owner.contents[0].blob).toBe('BASE64IMAGEDATA');
    expect(owner.contents[0].mimeType).toBe('image/png');

    const other = await resource.read(uri, extraFor(tokenFor('accountB')));
    expect(other.contents[0].blob).toBeUndefined();
    expect(other.contents[0].text).toBe(NOT_FOUND);
  });
});
