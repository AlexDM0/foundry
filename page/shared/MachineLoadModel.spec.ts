/**
 * This machine's agents against its limit, read from a fleet document. What matters: the figure, the meter and the limit's line come from
 * the document's own figures; the brain is named outside a known limit; and an unreachable forge's agents are named as last reported.
 * The rail and the Agents view's empty state show this one reading, so their specs hold its words in place.
 */
import { describe, expect, test } from 'bun:test';

import { FLEET_DEGRADED }    from '../testing/fixtures/fleet-degraded.ts';
import { FLEET_FIVE_FORGES } from '../testing/fixtures/fleet-five-forges.ts';
import { MachineLoadModel }  from './MachineLoadModel.ts';

describe('this machine\'s load', () => {
  test('reads the agents against the limit, with the brain outside it', () => {
    expect(MachineLoadModel.machineLoadOf(FLEET_FIVE_FORGES)).toEqual({
      agentsText:     '10 / 12',
      meter:          { filled: 10, slots: 12, label: '10 of 12 agents' },
      atTheLimitLine: null,
      limitLine:      'limit 12 of 12 CPUs · Flint\'s brain runs outside it',
      isAtTheLimit:   false,
    });
  });

  test('names the agents of an unreachable forge as it last reported them', () => {
    expect(MachineLoadModel.machineLoadOf(FLEET_DEGRADED).limitLine).toBe('limit 12 of 12 CPUs · 3 of the 10 as last reported');
  });
});
