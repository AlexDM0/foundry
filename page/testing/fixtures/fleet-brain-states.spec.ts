/**
 * The fixture must hold artboard B1's five brain states on Example Storefront and change nothing else of the five forges, or B1's screens
 * compare the bar with another fleet. What matters: only Storefront's brain and its control contract differ; the brain's row is in the
 * fleet's agents only while the brain runs; an ended brain is still within the minute the forge keeps it (G1).
 */
import { describe, expect, test } from 'bun:test';

import type { FleetDocumentBrainState }                                             from '../../@types/FleetDocument.ts';
import { fleetWithStorefrontBrainOf, FLINT_BRAIN_JOB_ID, STOREFRONT_BRAINS }        from './fleet-brain-states.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS, FLEET_FIXTURES_READ_AT } from './fleet-five-forges.ts';

const STATES: readonly FleetDocumentBrainState[] = ['off', 'starting', 'running', 'refused', 'ended'];

const SECONDS_THE_FORGE_KEEPS_AN_ENDED_BRAIN = 60;

const MILLISECONDS_PER_SECOND = 1000;

describe('the fleet-brain-states fixture', () => {
  test('changes only Example Storefront\'s brain, to each state of B1\'s tweak, and its control contract, to the one that carries the brain', () => {
    for (const state of STATES) {
      const fleetDocument = fleetWithStorefrontBrainOf(state);
      const changedForges = fleetDocument.forges.filter((forge, i) => forge !== FLEET_FIVE_FORGES.forges[i]);
      expect(changedForges.map((forge) => [forge.trackerId, forge.brain === 'not-reported' ? null : forge.brain.state])).toEqual([
        [FLEET_FIVE_FORGES_TRACKER_IDS.exampleStorefront, state],
      ]);
      const [storefront] = changedForges;
      expect(storefront?.contracts.control).toBe(2);
      expect({ ...storefront, brain: null, contracts: null }).toEqual({ ...FLEET_FIVE_FORGES.forges[0], brain: null, contracts: null });
    }
  });

  test('lists the brain\'s agent row only while the brain runs', () => {
    const brainRowsByState = STATES.map((state) => [state, fleetWithStorefrontBrainOf(state).agents.filter((row) => row.jobId === FLINT_BRAIN_JOB_ID).length]);
    expect(brainRowsByState).toEqual([['off', 0], ['starting', 0], ['running', 1], ['refused', 0], ['ended', 0]]);
  });

  test('holds the refusal and the ended sentence B1 draws, the ended brain within the minute the forge keeps it', () => {
    expect(STOREFRONT_BRAINS.refused.refusal).toEqual({ code: 'usage-limit-holds', sentence: 'launches are held until 16:00 (usage limit)' });
    expect(STOREFRONT_BRAINS.ended.sentence).toBe('Flint\'s brain stopped after 2:00 · 4.2k tokens');
    const secondsSinceEnded = (Date.parse(FLEET_FIXTURES_READ_AT) - Date.parse(STOREFRONT_BRAINS.ended.endedAt ?? '')) / MILLISECONDS_PER_SECOND;
    expect(secondsSinceEnded).toBeLessThan(SECONDS_THE_FORGE_KEEPS_AN_ENDED_BRAIN);
  });
});
