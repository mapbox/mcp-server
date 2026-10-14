// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TemporaryDataResource } from '../../../src/resources/temporary/TemporaryDataResource.js';
import { temporaryResourceManager } from '../../../src/utils/temporaryResourceManager.js';
import {
  storeMapPayload,
  resolveMapPayloadRef
} from '../../../src/utils/storeMapPayload.js';
import {
  getOwnerKeyFromToken,
  getUserNameFromToken
} from '../../../src/utils/jwtUtils.js';

// Build a Mapbox-style 3-part JWT whose payload carries the username (`u`).
function tokenFor(username: string): string {
  const payload = Buffer.from(JSON.stringify({ u: username })).toString(
    'base64'
  );
  return `pk.${payload}.sig`;
}

// The ownership key a resource is stamped with is a fingerprint of the exact
// token bytes, so tests seed resources with the key derived from that account's
// token rather than with a bare username.
function ownerKeyFor(username: string): string {
  return getOwnerKeyFromToken(tokenFor(username)) as string;
}

// A token an attacker can build from scratch knowing only the victim's Mapbox
// username: same unsigned `u` claim, different (garbage) signature. Mapbox signs
// with a secret this server does not hold, so nothing here can tell a real
// signature from this one.
function forgedTokenFor(username: string): string {
  const payload = Buffer.from(JSON.stringify({ u: username })).toString(
    'base64'
  );
  return `not-a-real-header.${payload}.not-a-real-signature`;
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

  function seedTextResource(uri: string, ownerUsername: string, data: unknown) {
    temporaryResourceManager.create({
      id: 'id',
      uri,
      data,
      metadata: { toolName: 'directions_tool' },
      owner: ownerKeyFor(ownerUsername)
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
      owner: ownerKeyFor('accountA')
    });

    const owner = await resource.read(uri, extraFor(tokenFor('accountA')));
    expect(owner.contents[0].blob).toBe('BASE64IMAGEDATA');
    expect(owner.contents[0].mimeType).toBe('image/png');

    const other = await resource.read(uri, extraFor(tokenFor('accountB')));
    expect(other.contents[0].blob).toBeUndefined();
    expect(other.contents[0].text).toBe(NOT_FOUND);
  });

  it('resolves a storeMapPayload ref via the real resources/read path (regression)', async () => {
    // storeMapPayload() previously never set `owner`, so every map-payload ref
    // was permanently unreadable via this real read path (always fell through
    // to NOT_FOUND) even for the account that created it - the iframe would
    // fail JSON.parse on that text and show "Map payload was empty or
    // malformed." regardless of the payload's actual shape.
    const ref = storeMapPayload(
      { summary: 'Test route', layers: [], markers: [] },
      ownerKeyFor('accountA')
    );

    const result = await resource.read(ref, extraFor(tokenFor('accountA')));
    const parsed = JSON.parse(result.contents[0].text as string);

    expect(parsed.summary).toBe('Test route');
  });

  // --- Token-forgery regression ---------------------------------------------
  // The account-scoping added in #205 compared the resource's owner to the `u`
  // claim decoded out of the caller's bearer token. That claim is unsigned and
  // cannot be verified here, so a caller who knew a resource URI and a Mapbox
  // username could fabricate a token asserting that name and read the resource.
  // Every token in the original suite was built by the same helper, so no test
  // ever asked what happens when an attacker builds one claiming the VICTIM's
  // name — which is precisely the bypass. These tests ask that question.

  it('does NOT return the owner’s data to a token forging the owner’s username', async () => {
    const uri = 'mapbox://temp/directions-forged';
    seedTextResource(uri, 'victim_user', { route: 'A-secret-geometry' });

    const forged = forgedTokenFor('victim_user');
    // The forged token is indistinguishable from a real one to the unsigned
    // claim reader — this is what the old username comparison trusted.
    expect(getUserNameFromToken(forged)).toBe('victim_user');

    const result = await resource.read(uri, extraFor(forged));

    expect(result.contents[0].text).toBe(NOT_FOUND);
    expect(result.contents[0].text).not.toContain('A-secret-geometry');
  });

  it('does NOT return an image blob to a token forging the owner’s username', async () => {
    const uri = 'mapbox://temp/static-map-forged';
    temporaryResourceManager.create({
      id: 'imgid',
      uri,
      data: 'BASE64IMAGEDATA',
      metadata: { toolName: 'static_map_image_tool' },
      mimeType: 'image/png',
      owner: ownerKeyFor('victim_user')
    });

    const result = await resource.read(
      uri,
      extraFor(forgedTokenFor('victim_user'))
    );

    expect(result.contents[0].blob).toBeUndefined();
    expect(result.contents[0].text).toBe(NOT_FOUND);
  });

  it('does NOT resolve a map-payload ref for a token forging the owner’s username', async () => {
    // resolveMapPayloadRef() goes straight to the manager rather than through
    // resources/read, so it carries its own copy of the ownership check and
    // needs its own regression coverage.
    const ref = storeMapPayload(
      { summary: 'Victim route', layers: [], markers: [] },
      ownerKeyFor('victim_user')
    );

    const forgedKey = getOwnerKeyFromToken(forgedTokenFor('victim_user'));
    expect(resolveMapPayloadRef(ref, forgedKey)).toBeNull();
    // ...and the legitimate token still resolves it.
    expect(
      resolveMapPayloadRef(ref, ownerKeyFor('victim_user'))
    ).not.toBeNull();
  });

  it('gives two tokens claiming the same username different ownership keys', async () => {
    const real = tokenFor('victim_user');
    const forged = forgedTokenFor('victim_user');

    // Same unsigned identity claim...
    expect(getUserNameFromToken(real)).toBe(getUserNameFromToken(forged));
    // ...but ownership is keyed on the token bytes, which the attacker lacks.
    expect(getOwnerKeyFromToken(real)).not.toBe(getOwnerKeyFromToken(forged));
  });

  it('never stores a username as the ownership key', async () => {
    // Guards against a future change reverting to username scoping: the stored
    // owner must not be anything a caller could assert about themselves.
    const uri = 'mapbox://temp/directions-keyshape';
    seedTextResource(uri, 'victim_user', { route: 'x' });

    const stored = temporaryResourceManager.get(uri);
    expect(stored?.owner).not.toBe('victim_user');
    expect(stored?.owner).toMatch(/^[0-9a-f]{64}$/);
  });
});
