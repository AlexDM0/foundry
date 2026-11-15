/** The fixture must hold B4's state: no forge registered, no machine limit known, and no forge program found or set. */
import { describe, expect, test } from 'bun:test';

import { FLEET_EMPTY } from './fleet-empty.ts';

describe('the fleet-empty fixture', () => {
  test('registers no forge and knows no machine limit', () => {
    expect(FLEET_EMPTY.forges).toEqual([]);
    expect(FLEET_EMPTY.figures.machineLimit).toBeNull();
    expect(FLEET_EMPTY.machine.cpuCount).toBe(12);
  });

  test('has no forge program in its settings and found none', () => {
    expect(FLEET_EMPTY.settings.forgeProgramPath).toBeNull();
    expect(FLEET_EMPTY.gaia.forgeProgramInUse).toBeNull();
  });
});
