/**
 * The extraction changed nothing a machine stores: `src/lib/process-identity/FrozenProcessSupervision.json` was taken from the code before the
 * port existed, and every start stamp, boot identity, group verdict, program line and signal of the macOS adapter over the same fixed worlds must
 * equal it, or every live child reads lost. Its `retake` key says how it was taken; it is never retaken from the port. A start's field is
 * now `startStamp`, its value the decimal text of the number taken: a rename, every digit as frozen.
 */
import { describe, expect, test } from 'bun:test';

import {
  FROZEN_BOOT_START_SCENARIOS,
  FROZEN_IDENTITY_SCENARIOS,
  FROZEN_STOP_SCENARIOS,
  replayProcessWorld
} from '../../testing/ProcessWorldReplay.ts';
import { createDarwinProcessIdentity }                                     from './DarwinProcessIdentity.ts';
import frozenTable                                                         from './FrozenProcessSupervision.json';
import { createPosixProcessGroups }                                        from './PosixProcessGroups.ts';
import type { ProcessStopRefusal }                                         from './ProcessIdentity.ts';
import { REAL_PROCESS_IDENTITY_PRIMITIVES, REAL_PROCESS_SIGNAL_PRIMITIVE } from './ProcessSupervisionFor.ts';

const STAGE_OF_SIGNAL = { SIGTERM: 'ask', SIGKILL: 'force' } as const;

/**
 * The table froze each refusal's sentence; the port now answers its cause, read here for that sentence. `TalosLogWordingUtil.spec.ts` holds
 * that Talos words each cause as the sentence again.
 */
const REFUSAL_OF_FROZEN_SENTENCE: Readonly<Record<string, ProcessStopRefusal>> = {
  'the process group 4242 could not be signalled: Error: example EPERM': { cause: 'group-not-signalled', processGroupId: 4242, systemError: 'Error: example EPERM' },
  'the members of process group 4242 could not be read':                 { cause: 'group-members-unreadable', processGroupId: 4242 },
};

function currentFormOf(frozenStop: unknown): unknown {
  const { answer } = frozenStop as { answer: { verdict: string; reason?: string } };
  if (answer.verdict !== 'refused' || answer.reason === undefined) return frozenStop;
  return { ...(frozenStop as object), answer: { verdict: 'refused', refusal: REFUSAL_OF_FROZEN_SENTENCE[answer.reason] } };
}

const supervision = createPosixProcessGroups(createDarwinProcessIdentity(REAL_PROCESS_IDENTITY_PRIMITIVES), REAL_PROCESS_SIGNAL_PRIMITIVE);

describe('the frozen process supervision table', () => {
  test('it holds every scenario', () => {
    expect(frozenTable.identities.map(({ name }) => name)).toEqual(FROZEN_IDENTITY_SCENARIOS.map(({ name }) => name));
    expect(frozenTable.stops.map(({ name }) => name)).toEqual(FROZEN_STOP_SCENARIOS.map(({ name }) => name));
    expect(frozenTable.bootStarts.map(({ name }) => name)).toEqual(FROZEN_BOOT_START_SCENARIOS.map(({ name }) => name));
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
      expect({ name: scenario.name, ...replay }).toEqual(currentFormOf(frozenTable.stops.find(({ name }) => name === scenario.name)) as never);
    });
  }

  for (const scenario of FROZEN_BOOT_START_SCENARIOS) {
    test(`a boot start: ${scenario.name}`, () => {
      const replay = replayProcessWorld(scenario.world, () => supervision.bootStartedAtEpochSeconds());
      expect({ name: scenario.name, ...replay }).toEqual(frozenTable.bootStarts.find(({ name }) => name === scenario.name) as never);
    });
  }
});
