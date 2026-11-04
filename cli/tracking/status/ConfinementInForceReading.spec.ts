/**
 * Whose confinement word `status --json` prints. A live Overseer's word wins over this process's probe, since a sandboxed caller fails its
 * own nested probe; with no answer, or an answer without a known word, the own probe speaks and the source says so.
 */
import { describe, expect, test } from 'bun:test';

import type { ConfinementVerdict } from '../../../src/lib/gate-confinement/GateConfinement.ts';
import { fakeGateConfinement }     from '../../../src/testing/FakeGateConfinement.ts';
import { confinementInForceOf }    from './ConfinementInForceReading.ts';

const RECORDED_PROBE_ANSWER: ConfinementVerdict = 'unavailable';

function recordedOverseerAnswerOf(confinement: unknown): object {
  return {
    overseer: { state: 'serving', batonPassWarning: null }, notices: [], confinement, confinementSource: 'overseer'
  };
}

describe('the confinement in force', () => {
  test.each(['confined', 'unavailable', 'unconfined-by-design'] as const)(
    'A1: with a live Overseer answering %s, its word is printed with the source overseer',
    (overseerWord) => {
      expect(confinementInForceOf(recordedOverseerAnswerOf(overseerWord), fakeGateConfinement(RECORDED_PROBE_ANSWER)))
        .toEqual({ confinement: overseerWord, confinementSource: 'overseer' });
    },
  );

  test('A2: with no live Overseer, the own probe\'s word is printed with the source this-process', () => {
    expect(confinementInForceOf(null, fakeGateConfinement(RECORDED_PROBE_ANSWER)))
      .toEqual({ confinement: RECORDED_PROBE_ANSWER, confinementSource: 'this-process' });
  });

  test.each([['no word', undefined], ['an unknown word', 'sandboxed'], ['a number', 1]] as const)(
    'an Overseer answer with %s falls back to the own probe',
    (_description, confinement) => {
      expect(confinementInForceOf(recordedOverseerAnswerOf(confinement), fakeGateConfinement('confined')))
        .toEqual({ confinement: 'confined', confinementSource: 'this-process' });
    },
  );
});
