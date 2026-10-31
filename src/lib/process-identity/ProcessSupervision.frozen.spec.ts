/**
 * The extraction changed nothing a machine stores: `src/lib/process-identity/FrozenProcessSupervision.json` was taken from the code before the
 * port existed, and every start stamp, boot identity, group verdict, program line and signal of the macOS adapter over the same fixed worlds must
 * equal it, or every live Watcher reads lost. Its `retake` key says how it was taken; it is never retaken from the port.
 */
import { describe, expect, test } from 'bun:test';

import { FROZEN_IDENTITY_SCENARIOS, FROZEN_STOP_SCENARIOS, replayProcessWorld } from '../../testing/ProcessWorldReplay.ts';
import { createDarwinProcessIdentity }                                          from './DarwinProcessIdentity.ts';
import frozenTable                                                              from './FrozenProcessSupervision.json';
import { createPosixProcessGroups }                                             from './PosixProcessGroups.ts';
import { REAL_PROCESS_IDENTITY_PRIMITIVES, REAL_PROCESS_SIGNAL_PRIMITIVE }      from './ProcessSupervisionFor.ts';

const STAGE_OF_SIGNAL = { SIGTERM: 'ask', SIGKILL: 'force' } as const;

// The boot id file is the one thing the stubs do not reach; on macOS it never exists.
const DARWIN_PRIMITIVES = { ...REAL_PROCESS_IDENTITY_PRIMITIVES, fileExists: () => false };

const supervision = createPosixProcessGroups(createDarwinProcessIdentity(DARWIN_PRIMITIVES), REAL_PROCESS_SIGNAL_PRIMITIVE);

describe('the frozen process supervision table', () => {
  test('it holds every scenario', () => {
    expect(frozenTable.identities.map(({ name }) => name)).toEqual(FROZEN_IDENTITY_SCENARIOS.map(({ name }) => name));
    expect(frozenTable.stops.map(({ name }) => name)).toEqual(FROZEN_STOP_SCENARIOS.map(({ name }) => name));
  });

  for (const scenario of FROZEN_IDENTITY_SCENARIOS) {
    test(`an identity: ${scenario.name}`, () => {
      const replay = replayProcessWorld(scenario.world, () => supervision.identityOf(scenario.processId));
      expect({ name: scenario.name, ...replay }).toEqual(frozenTable.identities.find(({ name }) => name === scenario.name) as never);
    });
  }

  for (const scenario of FROZEN_STOP_SCENARIOS) {
    test(`a group stop: ${scenario.name}`, () => {
      const replay = replayProcessWorld(scenario.world, () => supervision.stopTree(scenario.leader, STAGE_OF_SIGNAL[scenario.signal]));
      expect({ name: scenario.name, ...replay }).toEqual(frozenTable.stops.find(({ name }) => name === scenario.name) as never);
    });
  }
});
