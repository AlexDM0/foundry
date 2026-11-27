/**
 * This machine's agents against its limit, read from a fleet document's own figures. The rail and the Agents view's empty state show
 * this one reading, so their specs hold its words in place.
 */
import { describe, expect, test } from 'bun:test';

import { FLEET_DEGRADED }    from '../testing/fixtures/fleet-degraded.ts';
import { FLEET_FIVE_FORGES } from '../testing/fixtures/fleet-five-forges.ts';
import { FLEET_VERSIONS }    from '../testing/fixtures/fleet-versions.ts';
import { MachineLoadModel }  from './MachineLoadModel.ts';

describe('this machine\'s load', () => {
  test('reads the agents against the limit', () => {
    expect(MachineLoadModel.machineLoadOf(FLEET_FIVE_FORGES)).toEqual({
      agentsText:     '10 / 12',
      meter:          { filled: 10, slots: 12, label: '10 of 12 agents' },
      atTheLimitLine: null,
      limitLine:      'limit 12 of 12 CPUs',
      isAtTheLimit:   false,
    });
  });

  test('names the agents of an unreachable forge as it last reported them', () => {
    expect(MachineLoadModel.machineLoadOf(FLEET_DEGRADED).limitLine).toBe('limit 12 of 12 CPUs · 3 of the 10 as last reported');
  });

  test('marks the figure as leaving out the forges at a version Gaia cannot talk to, and the line counts them', () => {
    const load = MachineLoadModel.machineLoadOf(FLEET_VERSIONS);
    expect([load.agentsText, load.meter.filled, load.limitLine]).toEqual(['8+ / 12', 8, 'limit 12 of 12 CPUs · 2 forges not counted']);
  });
});
