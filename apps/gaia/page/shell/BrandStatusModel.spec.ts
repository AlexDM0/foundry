/**
 * What the brand bar says of the fleet (SCREENS "The shell"). What matters: the pill counts the forges whose Overseer runs, held, paused and
 * passing the baton among them, and one at a version Gaia cannot talk to, which answered its versions, and pulses only while one does; the
 * sentence counts every other condition, the running ones named apart first, a forge that needs an update apart from one not readable; a
 * hidden forge is left out; with no forge the pill says none is registered (B4), with every forge hidden that none is shown; and before the
 * first document the bar says nothing of the fleet.
 */
import { describe, expect, test } from 'bun:test';

import type { FleetDocument }                               from '../@types/FleetDocument.ts';
import { FLEET_AT_LIMIT }                                   from '../testing/fixtures/fleet-at-limit.ts';
import { FLEET_DEGRADED }                                   from '../testing/fixtures/fleet-degraded.ts';
import { FLEET_EMPTY }                                      from '../testing/fixtures/fleet-empty.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS } from '../testing/fixtures/fleet-five-forges.ts';
import { FLEET_VERSIONS }                                   from '../testing/fixtures/fleet-versions.ts';
import { BrandStatusModel }                                 from './BrandStatusModel.ts';

const TRACKER_IDS = FLEET_FIVE_FORGES_TRACKER_IDS;

function withHidden(hiddenTrackerIds: string[]): FleetDocument {
  return { ...FLEET_FIVE_FORGES, settings: { ...FLEET_FIVE_FORGES.settings, hiddenTrackerIds } };
}

describe('the brand bar\'s status', () => {
  test('A1: four forges running in the orange pill, and the held, dormant and missing ones in the sentence', () => {
    expect(BrandStatusModel.brandStatusOf(FLEET_FIVE_FORGES)).toEqual({
      fleet:    'running',
      pillText: '4 forges running',
      sentence: '1 holds its launches · 1 dormant · 1 repository missing',
    });
  });

  test('B2: a paused forge still runs, and is named in the sentence beside a starting one', () => {
    expect(BrandStatusModel.brandStatusOf(FLEET_AT_LIMIT)?.sentence).toBe('1 paused · 1 holds its launches · 1 starting · 1 repository missing');
  });

  test('B3: an unreachable forge and one this Gaia cannot read are named in the sentence', () => {
    expect(BrandStatusModel.brandStatusOf(FLEET_DEGRADED)).toEqual({
      fleet:    'running',
      pillText: '3 forges running',
      sentence: '1 holds its launches · 1 unreachable · 1 not readable by this Gaia',
    });
  });

  test('U1: a forge older and one newer than this Gaia run, and the sentence names the one needing a forge update apart', () => {
    expect(BrandStatusModel.brandStatusOf(FLEET_VERSIONS)).toEqual({
      fleet:    'running',
      pillText: '5 forges running',
      sentence: '1 needs a forge update · 1 not readable by this Gaia',
    });
  });

  test('a hidden forge is left out, and one running forge is singular', () => {
    expect(BrandStatusModel.brandStatusOf(withHidden([TRACKER_IDS.legacyImporter]))?.sentence).toBe('1 holds its launches · 1 dormant');
    const oneRunning = withHidden([TRACKER_IDS.invoiceService, TRACKER_IDS.researchWiki, TRACKER_IDS.exampleMobileApp]);
    expect(BrandStatusModel.brandStatusOf(oneRunning)?.pillText).toBe('1 forge running');
  });

  test('with no forge running the pill is neutral and does not pulse', () => {
    const noneRunning = withHidden([TRACKER_IDS.exampleStorefront, TRACKER_IDS.invoiceService, TRACKER_IDS.researchWiki, TRACKER_IDS.exampleMobileApp]);
    expect(BrandStatusModel.brandStatusOf(noneRunning)).toEqual({ fleet: 'dormant', pillText: 'No forge running', sentence: '1 dormant · 1 repository missing' });
  });

  test('B4: with no forge registered the neutral pill says so, and the sentence that nothing runs yet', () => {
    expect(BrandStatusModel.brandStatusOf(FLEET_EMPTY)).toEqual({ fleet: 'dormant', pillText: 'No forge registered', sentence: 'nothing runs on this machine yet' });
  });

  test('with every forge hidden the pill says none is shown, and the sentence why', () => {
    expect(BrandStatusModel.brandStatusOf(withHidden(Object.values(TRACKER_IDS)))).toEqual({
      fleet:    'dormant',
      pillText: 'No forge shown',
      sentence: 'every forge is hidden in Gaia',
    });
  });

  test('before the first document the bar says nothing of the fleet', () => {
    expect(BrandStatusModel.brandStatusOf(null)).toBeNull();
  });
});
