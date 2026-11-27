/**
 * From a tracker id to a forge's Hephaestus: a registered forge the watch read at a version Gaia talks to gives its access, its token read again at
 * each call, and each way there is no access (unregistered, unreadable registry, unreachable, wrong version or missing token) is its own refusal
 * that asks nothing.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { SUPPORTED_FORGE_VERSION }                   from '../../lib/forge-client/constants/SupportedForgeVersions.ts';
import { recordedHephaestusFetch }                   from '../../testing/RecordedAnswers.ts';
import { createScratchDirectory, removeScratchPath } from '../../testing/ScratchRoot.ts';
import { forgeAccessVerdictFor }                     from './ForgeAccess.ts';
import {
  EXAMPLE_FORGE_TOKEN,
  STOREFRONT_TRACKER_ID,
  STOREFRONT_URL,
  exampleRelayForgeOf,
  exampleTokenFileIn,
  relaySourcesOver,
  type ExampleRelayForgeOptions,
} from './testing/ExampleRelayForge.ts';

let scratchFolder = '';
let tokenPath = '';

beforeEach(() => {
  scratchFolder = createScratchDirectory('forge-access');
  tokenPath     = exampleTokenFileIn(scratchFolder);
});

afterEach(() => {
  removeScratchPath(scratchFolder);
});

function sourcesOf(options: ExampleRelayForgeOptions = {}) {
  return relaySourcesOver(exampleRelayForgeOf(scratchFolder, tokenPath, options), recordedHephaestusFetch([]));
}

describe('a forge Gaia can reach', () => {
  test('gives the access to its Hephaestus with its token, and the version the watch read', async () => {
    expect(await forgeAccessVerdictFor(STOREFRONT_TRACKER_ID, sourcesOf())).toEqual({
      verdict:            'access',
      access:             { hephaestusUrl: STOREFRONT_URL, bearerToken: EXAMPLE_FORGE_TOKEN },
      forgeSystemVersion: SUPPORTED_FORGE_VERSION,
    });
  });

  test('gives the access to a forge ahead of the supported version, with the version it runs', async () => {
    const ahead = { major: SUPPORTED_FORGE_VERSION.major, minor: SUPPORTED_FORGE_VERSION.minor + 1 };
    const verdict = await forgeAccessVerdictFor(STOREFRONT_TRACKER_ID, sourcesOf({ versions: { verdict: 'ahead', current: ahead, minimumSupported: { major: 1, minor: 0 } } }));
    expect(verdict).toMatchObject({ verdict: 'access', forgeSystemVersion: ahead });
  });

  test('reads the token file again at each call, since Hephaestus writes a fresh one at each start', async () => {
    const sources = sourcesOf();
    await forgeAccessVerdictFor(STOREFRONT_TRACKER_ID, sources);
    writeFileSync(tokenPath, 'example-token-after-a-restart\n');
    expect(await forgeAccessVerdictFor(STOREFRONT_TRACKER_ID, sources)).toMatchObject({ access: { bearerToken: 'example-token-after-a-restart' } });
  });
});

describe('a forge Gaia cannot reach', () => {
  test('is forge-not-registered when the registry names no such forge, or there is no registry', async () => {
    const forge = exampleRelayForgeOf(scratchFolder, tokenPath);
    const emptyRegistry = relaySourcesOver(forge, recordedHephaestusFetch([]), { verdict: 'readable', forges: [] });
    const noRegistry = relaySourcesOver(forge, recordedHephaestusFetch([]), { verdict: 'absent' });
    expect(await forgeAccessVerdictFor(STOREFRONT_TRACKER_ID, emptyRegistry)).toEqual({ verdict: 'refused', refusal: 'forge-not-registered' });
    expect(await forgeAccessVerdictFor(STOREFRONT_TRACKER_ID, noRegistry)).toEqual({ verdict: 'refused', refusal: 'forge-not-registered' });
  });

  test('names the registry\'s own refusal when it cannot be read', async () => {
    const sources = relaySourcesOver(exampleRelayForgeOf(scratchFolder, tokenPath), recordedHephaestusFetch([]), { verdict: 'newer-version', version: 2 });
    expect(await forgeAccessVerdictFor(STOREFRONT_TRACKER_ID, sources)).toEqual({ verdict: 'refused', refusal: 'registry-newer-version' });
  });

  test('is forge-unreachable for a forge the watch could not reach or has not read its versions of', async () => {
    expect(await forgeAccessVerdictFor(STOREFRONT_TRACKER_ID, sourcesOf({ fidelity: 'unreachable' }))).toEqual({ verdict: 'refused', refusal: 'forge-unreachable' });
    expect(await forgeAccessVerdictFor(STOREFRONT_TRACKER_ID, sourcesOf({ versions: null }))).toEqual({ verdict: 'refused', refusal: 'forge-unreachable' });
  });

  test('is forge-unreachable when the registry names Hephaestus at another address than the watch read', async () => {
    const forge = exampleRelayForgeOf(scratchFolder, tokenPath);
    const moved = { ...forge, reading: { ...forge.reading, url: 'http://127.0.0.1:4961/' } };
    expect(await forgeAccessVerdictFor(STOREFRONT_TRACKER_ID, relaySourcesOver(moved, recordedHephaestusFetch([])))).toEqual({ verdict: 'refused', refusal: 'forge-unreachable' });
  });

  test('is forge-version-unsupported for a forge newer or older than Gaia talks to', async () => {
    const newer = { verdict: 'newer', current: { major: 2, minor: 1 }, minimumSupported: { major: 2, minor: 0 } } as const;
    const older = { verdict: 'older', current: { major: 1, minor: 0 }, minimumSupported: { major: 1, minor: 0 } } as const;
    const unsupported = { verdict: 'refused', refusal: 'forge-version-unsupported' } as const;
    expect(await forgeAccessVerdictFor(STOREFRONT_TRACKER_ID, sourcesOf({ fidelity: 'newer-contract', versions: newer }))).toEqual(unsupported);
    expect(await forgeAccessVerdictFor(STOREFRONT_TRACKER_ID, sourcesOf({ fidelity: 'older-contract', versions: older }))).toEqual(unsupported);
  });

  test('is token-unreadable when the token file is gone or the registry names none', async () => {
    const absentToken = sourcesOf({ tokenPath: join(scratchFolder, 'absent-token') });
    expect(await forgeAccessVerdictFor(STOREFRONT_TRACKER_ID, absentToken)).toEqual({ verdict: 'refused', refusal: 'token-unreadable' });
    expect(await forgeAccessVerdictFor(STOREFRONT_TRACKER_ID, sourcesOf({ tokenPath: null }))).toEqual({ verdict: 'refused', refusal: 'token-unreadable' });
  });
});
