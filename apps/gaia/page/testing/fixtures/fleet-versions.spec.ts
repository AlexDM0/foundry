/**
 * The fixture must hold the Versions boards' example data. What matters: one forge at each verdict against this Gaia's forge 3.1, with the
 * boards' versions; a forge Gaia cannot talk to read from the registry alone, as the server reads it, and left out of every total; and the
 * forge that states no version standing in for Example Billing.
 */
import { describe, expect, test } from 'bun:test';

import {
  FLEET_VERSIONS,
  FLEET_VERSIONS_READINGS,
  FLEET_VERSIONS_STATING_NO_VERSION,
  FLEET_VERSIONS_TRACKER_IDS,
} from './fleet-versions.ts';

function versionTextOf(version: { readonly major: number; readonly minor: number } | null): string {
  return version === null ? 'none' : `${version.major}.${version.minor}`;
}

describe('the fleet-versions fixture', () => {
  test('is this Gaia at version 1.4, built for forge 3.1', () => {
    expect(FLEET_VERSIONS.gaia.versions).toEqual({ systemVersion: { major: 1, minor: 4 }, supportedForgeVersion: { major: 3, minor: 1 } });
  });

  test('holds the boards\' five forges, each at its verdict, current version and oldest served', () => {
    expect(FLEET_VERSIONS.forges.map((forge) => [
      forge.project,
      forge.versions?.verdict,
      versionTextOf(forge.versions?.current ?? null),
      versionTextOf(forge.versions?.minimumSupported ?? null),
    ])).toEqual([
      ['Example Storefront', 'ahead', '3.4', '3.0'],
      ['Invoice Service', 'current', '3.1', '3.0'],
      ['Research Wiki', 'current', '3.1', '3.0'],
      ['Example Billing', 'older', '1.8', '1.0'],
      ['Analytics Sandbox', 'newer', '4.1', '4.0'],
    ]);
  });

  test('reads a forge it cannot talk to from the registry alone: no code, no contract, nothing of its work', () => {
    for (const forge of [FLEET_VERSIONS_READINGS.exampleBilling, FLEET_VERSIONS_READINGS.analyticsSandbox, FLEET_VERSIONS_READINGS.exampleDocs]) {
      expect([forge.condition, forge.codeVersion, forge.agents, forge.attention, forge.attentionCount, forge.brain]).toEqual(['unreadable', null, [], [], null, 'not-reported']);
      expect(Object.values(forge.contracts)).toEqual([null, null, null]);
    }
    expect(FLEET_VERSIONS.needsALook).toEqual([
      { trackerId: FLEET_VERSIONS_TRACKER_IDS.exampleBilling, kind: 'older-contract' },
      { trackerId: FLEET_VERSIONS_TRACKER_IDS.analyticsSandbox, kind: 'newer-contract' },
    ]);
  });

  test('counts eight agents and five entries of the three forges it reads, and names the two it leaves out of the totals', () => {
    const readTrackerIds = new Set<string>([FLEET_VERSIONS_TRACKER_IDS.exampleStorefront, FLEET_VERSIONS_TRACKER_IDS.invoiceService, FLEET_VERSIONS_TRACKER_IDS.researchWiki]);
    expect(FLEET_VERSIONS.agents).toHaveLength(FLEET_VERSIONS.figures.agentsInFlight);
    expect(FLEET_VERSIONS.attention.map((item) => item.idText)).toEqual(['E4', '#015', '#031', 'E2', 'E7']);
    const entries = [...FLEET_VERSIONS.agents, ...FLEET_VERSIONS.attention, ...FLEET_VERSIONS.activity];
    expect(entries.every((entry) => entry.trackerId !== null && readTrackerIds.has(entry.trackerId))).toBe(true);
    expect(FLEET_VERSIONS.figures.incompleteFor).toEqual([FLEET_VERSIONS_TRACKER_IDS.exampleBilling, FLEET_VERSIONS_TRACKER_IDS.analyticsSandbox]);
  });

  test('puts Example Docs, which states no version, in Example Billing\'s place', () => {
    const docs = FLEET_VERSIONS_STATING_NO_VERSION.forges.find((forge) => forge.trackerId === FLEET_VERSIONS_TRACKER_IDS.exampleDocs);
    expect(docs?.versions).toEqual({ verdict: 'older', current: null, minimumSupported: null });
    expect(FLEET_VERSIONS_STATING_NO_VERSION.forges.some((forge) => forge.trackerId === FLEET_VERSIONS_TRACKER_IDS.exampleBilling)).toBe(false);
    expect(FLEET_VERSIONS_STATING_NO_VERSION.needsALook[0]).toEqual({ trackerId: FLEET_VERSIONS_TRACKER_IDS.exampleDocs, kind: 'older-contract' });
  });
});
