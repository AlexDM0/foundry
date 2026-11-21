/**
 * The versioned path scheme against its own contract. What matters: a versioned path and a path with no version name the same endpoint, an
 * endpoint below a version keeps every segment, a `v` that is no whole version of at least 1 is part of the endpoint and not a version, and
 * a path outside `/api/` names nothing.
 */
import { describe, expect, test } from 'bun:test';

import { ApiPathUtil } from './ApiPathUtil.ts';

describe('the paths of an endpoint', () => {
  test('are /api/v<n>/<endpoint>, and the versions path stands apart from them', () => {
    expect(ApiPathUtil.versionedPathOf('fleet', 4)).toBe('/api/v4/fleet');
    expect(ApiPathUtil.VERSIONS_PATH).toBe('/api/versions');
  });
});

describe('the endpoint of a path', () => {
  test('is read with its version from a versioned path, and with no version from an unversioned one', () => {
    expect(ApiPathUtil.endpointOfPath('/api/v4/fleet')).toEqual({ endpoint: 'fleet', version: 4 });
    expect(ApiPathUtil.endpointOfPath('/api/v12/monitor/events')).toEqual({ endpoint: 'monitor/events', version: 12 });
    expect(ApiPathUtil.endpointOfPath('/api/fleet')).toEqual({ endpoint: 'fleet', version: null });
    expect(ApiPathUtil.endpointOfPath('/api/versions')).toEqual({ endpoint: 'versions', version: null });
  });

  test('keeps a v that is no whole version of at least 1, or names no endpoint after it, as part of the endpoint', () => {
    expect(ApiPathUtil.endpointOfPath('/api/v0/fleet')).toEqual({ endpoint: 'v0/fleet', version: null });
    expect(ApiPathUtil.endpointOfPath('/api/v01/fleet')).toEqual({ endpoint: 'v01/fleet', version: null });
    expect(ApiPathUtil.endpointOfPath('/api/vfour/fleet')).toEqual({ endpoint: 'vfour/fleet', version: null });
    expect(ApiPathUtil.endpointOfPath('/api/v4')).toEqual({ endpoint: 'v4', version: null });
  });

  test('is null outside /api/ and for /api/ itself', () => {
    for (const pathname of ['/', '/index.html', '/apis/fleet', '/api', '/api/']) expect(ApiPathUtil.endpointOfPath(pathname)).toBeNull();
  });
});
