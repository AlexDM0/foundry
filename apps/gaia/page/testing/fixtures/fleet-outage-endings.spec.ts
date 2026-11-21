/** The fixture must hold one outage state: the alert heads what waits and counts once, and each forge's count is its waiting jobs the rule counts. */
import { describe, expect, test } from 'bun:test';

import { FLEET_OUTAGE_ALERT, FLEET_OUTAGE_ENDINGS } from './fleet-outage-endings.ts';

describe('the fleet-outage-endings fixture', () => {
  test('heads what waits on User with the fleet\'s alert, counted once in waitingOnUser', () => {
    expect(FLEET_OUTAGE_ENDINGS.attention[0]).toEqual(FLEET_OUTAGE_ALERT);
    expect(FLEET_OUTAGE_ENDINGS.figures.waitingOnUser).toBe(FLEET_OUTAGE_ENDINGS.attention.length);
  });

  test('counts in each forge only its jobs a network outage stopped that wait for an instruction, and sums them in the total', () => {
    for (const forge of FLEET_OUTAGE_ENDINGS.forges) {
      expect(forge.outageEndings).toBe(forge.waitingWork.filter((job) => job.cause === 'network-outage' && job.waitsFor === 'instruction').length);
    }
    expect(FLEET_OUTAGE_ENDINGS.outageEndingsTotal).toBe(FLEET_OUTAGE_ENDINGS.forges.reduce((total, forge) => total + forge.outageEndings, 0));
    expect(FLEET_OUTAGE_ENDINGS.outageEndingsTotal).toBe(3);
  });
});
