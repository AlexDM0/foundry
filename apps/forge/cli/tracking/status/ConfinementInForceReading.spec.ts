/**
 * Whose confinement word `status --json` prints. A live Hephaestus's word wins over this process's probe, since a sandboxed caller fails its
 * own nested probe; with no answer, or an answer without a known word, the own probe speaks and the source says so.
 */
import { describe, expect, test } from 'bun:test';

import type { ConfinementVerdict } from '../../../src/lib/gate-confinement/GateConfinement.ts';
import { fakeGateConfinement }     from '../../../src/testing/FakeGateConfinement.ts';
import { confinementInForceOf }    from './ConfinementInForceReading.ts';

const RECORDED_PROBE_ANSWER: ConfinementVerdict = 'unavailable';

function recordedHephaestusAnswerOf(confinement: unknown): object {
  return {
    hephaestus: { state: 'serving', restartWarning: null }, notices: [], confinement, confinementSource: 'hephaestus'
  };
}

describe('the confinement in force', () => {
  test.each(['confined', 'unavailable', 'unconfined-by-design'] as const)(
    'A1: with a live Hephaestus answering %s, its word is printed with the source hephaestus',
    (hephaestusWord) => {
      expect(confinementInForceOf(recordedHephaestusAnswerOf(hephaestusWord), fakeGateConfinement(RECORDED_PROBE_ANSWER)))
        .toEqual({ confinement: hephaestusWord, confinementSource: 'hephaestus' });
    },
  );

  test('A2: with no live Hephaestus, the own probe\'s word is printed with the source this-process', () => {
    expect(confinementInForceOf(null, fakeGateConfinement(RECORDED_PROBE_ANSWER)))
      .toEqual({ confinement: RECORDED_PROBE_ANSWER, confinementSource: 'this-process' });
  });

  test.each([['no word', undefined], ['an unknown word', 'sandboxed'], ['a number', 1]] as const)(
    'a Hephaestus answer with %s falls back to the own probe',
    (_description, confinement) => {
      expect(confinementInForceOf(recordedHephaestusAnswerOf(confinement), fakeGateConfinement('confined')))
        .toEqual({ confinement: 'confined', confinementSource: 'this-process' });
    },
  );
});
