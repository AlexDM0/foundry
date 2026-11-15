/** Which readings count as the Overseer having answered: a reading it served at any contract does, a forge that is down or gone does not. */
import { describe, expect, test } from 'bun:test';

import type { ForgeFidelity }           from '../@types/ForgeReading.ts';
import { OVERSEER_ANSWERED_FIDELITIES } from './ForgeFidelities.ts';

const EVERY_FIDELITY: readonly ForgeFidelity[] = ['full', 'counts-only', 'newer-contract', 'unreachable', 'dormant', 'repository-missing'];

describe('the fidelities the Overseer answered at', () => {
  test('are full, counts-only and newer-contract, and no other', () => {
    expect(EVERY_FIDELITY.filter((fidelity) => OVERSEER_ANSWERED_FIDELITIES.has(fidelity))).toEqual(['full', 'counts-only', 'newer-contract']);
  });
});
