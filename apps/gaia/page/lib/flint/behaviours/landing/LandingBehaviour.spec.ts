/**
 * The landing after a drop on a habitat: Flint falls to the floor, looks around, and only then lives in the habitat and hears `arrived`; a
 * habitat that is gone or too small ends it in the wander.
 */
import { describe, expect, test } from 'bun:test';

import { ARRIVED_CUE }                                      from '../../SpriteHabitat.ts';
import { INITIAL_MIND_STATE }                               from '../../SpriteMind.ts';
import type { SpriteMindState }                             from '../../mind/MindState.ts';
import { CHAT, CHAT_BOX, perceptionOf }                     from '../../testing/MindRun.ts';
import { GROUNDED, JumpMotionUtil }                         from '../../utils/JumpMotionUtil.ts';
import type { LandingState }                                from './LandingBehaviour.ts';
import { landingAfterFrame, landingPartOf, landingStarted } from './LandingBehaviour.ts';

/** Let go above the chat, far to the left of its floor. */
const LET_GO: SpriteMindState = {
  ...INITIAL_MIND_STATE,
  isPlaced: true,
  motion:   { ...INITIAL_MIND_STATE.motion, positionX: 100, floorY: 300 },
};

function droppedOf(state: SpriteMindState): LandingState {
  if (state.behaviour.name !== 'landing') throw new Error(`Flint is ${state.behaviour.name}, not landing`);
  return state.behaviour as LandingState;
}

function frameAt(state: SpriteMindState, elapsedMilliseconds: number, perception = perceptionOf()): SpriteMindState {
  return landingAfterFrame(state, droppedOf(state), perception, { elapsedMilliseconds, deltaMilliseconds: 16 });
}

describe('the fall', () => {
  test('Flint falls from where it was let go to the habitat floor, placed inside that floor', () => {
    const falling = landingStarted(LET_GO, CHAT, false);
    expect(droppedOf(falling)).toEqual({ name: 'landing', habitatId: 'chat', landedAtMilliseconds: null });
    expect(falling.motion).toMatchObject({ positionX: CHAT_BOX.leftX + 20, floorY: CHAT_BOX.floorY });
    expect(falling.motion.jump.height).toBe(CHAT_BOX.floorY - 300);
  });

  test('under reduced motion Flint is on the floor at once', () => {
    expect(landingStarted(LET_GO, CHAT, true).motion.jump).toEqual(GROUNDED);
  });

  test('while Flint is in the air it stays landing and has not landed', () => {
    const falling = landingStarted(LET_GO, CHAT, false);
    expect(JumpMotionUtil.isAirborne(falling.motion.jump)).toBe(true);
    expect(droppedOf(frameAt(falling, 100)).landedAtMilliseconds).toBeNull();
  });
});

describe('after the landing', () => {
  test('Flint looks around for three glances, then lives in the habitat and hears arrived', () => {
    const landed = frameAt(landingStarted(LET_GO, CHAT, true), 1000);
    expect(droppedOf(landed).landedAtMilliseconds).toBe(1000);
    expect(frameAt(landed, 2199).behaviour.name).toBe('landing');
    const arrived = frameAt(landed, 2200);
    expect([arrived.livesIn, arrived.behaviour.name, arrived.directorInbox]).toEqual(['chat', 'wander', [ARRIVED_CUE]]);
  });

  test('a habitat that is gone, or too small, ends the landing in the wander', () => {
    const falling = landingStarted(LET_GO, CHAT, false);
    expect(frameAt(falling, 100, perceptionOf({ habitats: [] })).behaviour.name).toBe('wander');
    expect(frameAt(falling, 100, perceptionOf({ habitats: [{ ...CHAT, isRoomy: false }] })).behaviour.name).toBe('wander');
  });
});

test('the glances shift the eyes left, right and back in turn, and no blink comes while Flint lands', () => {
  const landed: LandingState = { name: 'landing', habitatId: 'chat', landedAtMilliseconds: 1000 };
  const inputAt = (elapsedMilliseconds: number) => ({ state: INITIAL_MIND_STATE, elapsedMilliseconds, reducedMotion: false });
  expect([0, 400, 800, 1200].map((age) => landingPartOf(landed, inputAt(1000 + age)).part)).toEqual([
    { eyes: { shift: -2 } }, { eyes: { shift: 6 } }, { eyes: { shift: 2 } }, null,
  ]);
  expect(landingPartOf({ ...landed, landedAtMilliseconds: null }, inputAt(1000))).toMatchObject({ part: null, blinkIsAllowed: false });
});
