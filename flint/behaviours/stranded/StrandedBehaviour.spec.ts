/**
 * A drop on no habitat. What matters: Flint stays where it was let go and shows the Doubt emote; only once the doubt has ended does it
 * go back, around the corner of the habitat it came from while that habitat is roomy, and otherwise to its home; and no blink comes while
 * it is stranded.
 */
import { describe, expect, test } from 'bun:test';

import { emoteDefinitionOf }                                   from '../../IntentMeaning.ts';
import { INITIAL_MIND_STATE }                                  from '../../SpriteMind.ts';
import type { SpriteMindState }                                from '../../mind/MindState.ts';
import { CHAT, HOME_BOX, perceptionOf }                        from '../../testing/MindRun.ts';
import type { StrandedState }                                  from './StrandedBehaviour.ts';
import { strandedAfterFrame, strandedPartOf, strandedStarted } from './StrandedBehaviour.ts';

const DOUBT_MILLISECONDS = emoteDefinitionOf('doubt').durationMilliseconds;

/** Let go at 1000 ms on no habitat, between the chat and the home. */
const LET_GO: SpriteMindState = {
  ...INITIAL_MIND_STATE,
  isPlaced: true,
  motion:   { ...INITIAL_MIND_STATE.motion, positionX: 640, floorY: 300 },
};

function strandedOf(state: SpriteMindState): StrandedState {
  if (state.behaviour.name !== 'stranded') throw new Error(`Flint is ${state.behaviour.name}, not stranded`);
  return state.behaviour as StrandedState;
}

function frameAt(state: SpriteMindState, elapsedMilliseconds: number, perception = perceptionOf()): SpriteMindState {
  return strandedAfterFrame(state, strandedOf(state), perception, { elapsedMilliseconds, deltaMilliseconds: 16 });
}

test('Flint stays where it was let go and shows the Doubt emote', () => {
  const stranded = strandedStarted(LET_GO, 'chat', 1000);
  expect(strandedOf(stranded)).toEqual({ name: 'stranded', startedAtMilliseconds: 1000, returnToHabitatId: 'chat' });
  expect([stranded.emote?.name, stranded.motion.positionX]).toEqual(['doubt', 640]);
  expect(frameAt(stranded, 1000 + DOUBT_MILLISECONDS - 1)).toBe(stranded);
});

describe('once the doubt has ended', () => {
  test('Flint goes back around the corner of the roomy habitat it came from', () => {
    const back = frameAt(strandedStarted(LET_GO, 'chat', 1000), 1000 + DOUBT_MILLISECONDS);
    expect(back.behaviour).toMatchObject({ name: 'visit', habitatId: 'chat' });
  });

  test('Flint goes home when it came from home, or from a habitat that is gone or too small', () => {
    const fromHome = frameAt(strandedStarted(LET_GO, null, 1000), 1000 + DOUBT_MILLISECONDS);
    const fromSmall = frameAt(strandedStarted(LET_GO, 'chat', 1000), 1000 + DOUBT_MILLISECONDS, perceptionOf({ habitats: [{ ...CHAT, isRoomy: false }] }));
    for (const home of [fromHome, fromSmall]) {
      expect([home.livesIn, home.behaviour.name, home.motion.floorY]).toEqual([null, 'wander', HOME_BOX.floorY]);
    }
  });
});

test('no blink comes while Flint is stranded', () => {
  expect(strandedPartOf().blinkIsAllowed).toBe(false);
});
