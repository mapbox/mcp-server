// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/* eslint-disable @typescript-eslint/no-explicit-any */

// Unit spec for the module itself; the guarantees callers depend on are covered
// through BaseTool / BaseResource / registerUiResources.

import { describe, it, expect } from 'vitest';
import { getActiveServer, runWithServer } from '../../src/utils/serverScope.js';

const fakeServer = (id: string) => ({ id }) as any;

describe('serverScope', () => {
  it('reports no active server outside runWithServer', () => {
    expect(getActiveServer()).toBeUndefined();
  });

  it('reports the server inside runWithServer', () => {
    const a = fakeServer('a');
    runWithServer(a, () => {
      expect(getActiveServer()).toBe(a);
    });
  });

  it('lets a nested run shadow the outer server and restores it after', () => {
    const a = fakeServer('a');
    const b = fakeServer('b');

    runWithServer(a, () => {
      runWithServer(b, () => {
        expect(getActiveServer()).toBe(b);
      });
      expect(getActiveServer()).toBe(a);
    });
  });

  it('keeps the binding across an await', async () => {
    const a = fakeServer('a');

    await runWithServer(a, async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(getActiveServer()).toBe(a);
    });
  });

  it('returns the callback result', () => {
    expect(runWithServer(fakeServer('a'), () => 42)).toBe(42);
  });
});
