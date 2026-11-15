/**
 * The forge versions the client is built for must hold together: the oldest forge it still talks to is no newer than the one it supports,
 * or no forge could ever be read in full.
 */
import { describe, expect, test } from 'bun:test';

import { SystemVersionUtil } from 'system-versions/SystemVersionUtil';

import { MINIMUM_FORGE_VERSION, SUPPORTED_FORGE_VERSION } from './SupportedForgeVersions.ts';

describe('the forge versions the client is built for', () => {
  test('hold together: the minimum forge version is no newer than the supported one', () => {
    expect(SystemVersionUtil.isOlder(SUPPORTED_FORGE_VERSION, MINIMUM_FORGE_VERSION)).toBe(false);
  });
});
