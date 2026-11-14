/**
 * The changes every behaviour shares, `02-animations.md`, "Rules between animations". What matters: walking stops a gesture unless it is
 * point or grab; jumping stops a gesture unless it is point, and starts only from the floor; an emote wakes Flint, and the sleep behaviour
 * sees the wake on its own frame; the gesture of the same intent goes on with only its target changed.
 */
import { describe, expect, test } from 'bun:test';

import { INITIAL_MIND_STATE }                   from '../SpriteMind.ts';
import { SLEEP_AWAKE, sleepStateFallingAsleep } from '../sleep/SleepSequence.ts';
import { JumpMotionUtil }                       from '../utils/JumpMotionUtil.ts';
import type { SpriteMindState }                 from './MindState.ts';
import {
  withEmote,
  withGesture,
  withJump,
  withWalking
} from './MindTransitions.ts';

const AWAKE: SpriteMindState = INITIAL_MIND_STATE;

describe('walking and jumping', () => {
  test('a walk stops a gesture unless it is point or grab, and faces its way', () => {
    expect(withWalking(withGesture(AWAKE, 'type', 0), 1).gesture).toBeNull();
    expect(withWalking(withGesture(AWAKE, 'point', 0), 1).gesture?.intent).toBe('point');
    expect(withWalking(withGesture(AWAKE, 'grab', 0), -1).gesture?.intent).toBe('grab');
    expect(withWalking(AWAKE, -1).motion.facing).toBe(-1);
  });

  test('a jump stops a gesture unless it is point, and starts only from the floor', () => {
    expect(withJump(withGesture(AWAKE, 'grab', 0)).gesture).toBeNull();
    expect(withJump(withGesture(AWAKE, 'point', 0)).gesture?.intent).toBe('point');
    const jumping = withJump(AWAKE);
    expect(JumpMotionUtil.isAirborne(jumping.motion.jump)).toBe(true);
    const inTheAir = { ...jumping, motion: { ...jumping.motion, jump: JumpMotionUtil.advanced(jumping.motion.jump, 100) } };
    expect(withJump(inTheAir).motion.jump).toBe(inTheAir.motion.jump);
  });
});

describe('gestures and emotes', () => {
  test('the gesture of the same intent goes on with only its target changed', () => {
    const grabbing = withGesture(AWAKE, 'grab', 100, { x: 1, y: -2 });
    const again = withGesture(grabbing, 'grab', 900, { x: 5, y: -6 });
    expect([again.gesture?.startedAtMilliseconds, again.gesture?.target]).toEqual([100, { x: 5, y: -6 }]);
  });

  test('an emote wakes a sleeping Flint; the sleep behaviour runs on until its own frame sees the wake', () => {
    const asleep = { ...AWAKE, behaviour: { name: 'sleep' as const }, sleep: sleepStateFallingAsleep(SLEEP_AWAKE, 0) };
    const surprised = withEmote(asleep, 'surprised', 500);
    expect([surprised.emote?.name, surprised.sleep.phase, surprised.behaviour.name]).toEqual(['surprised', 'waking', 'sleep']);
  });
});
