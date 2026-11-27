/**
 * The sleep sequence: how the level rises and falls, the pose, eyes, breath and glow that follow it, when the embers start and fade,
 * waking, and that under reduced motion Flint does not breathe and no ember rises.
 */
import { describe, expect, test } from 'bun:test';

import { composedTargetPose } from '../PoseComposition.ts';
import { NEUTRAL_POSE }       from '../SpritePose.ts';
import type { SleepState }    from './SleepSequence.ts';
import {
  embersStartOf,
  SLEEP_AWAKE,
  sleepIsActive,
  sleepLevelAt,
  sleepPartOf,
  sleepStateAfterFrame,
  sleepStateFallingAsleep,
  sleepStateWaking
} from './SleepSequence.ts';

const FELL_ASLEEP_AT = 1000;
/** The time the level needs from 0 to pass 0.9 at rate 2.2: ln(10) / 2.2 seconds. */
const EMBERS_START_AFTER_MILLISECONDS = (Math.log(10) / 2.2) * 1000;
/** A moment of the breath where sin(t / 716) is 1. */
const DEEPEST_BREATH_MILLISECONDS = 716 * (Math.PI / 2) + (716 * 2 * Math.PI * 10);

const asleep = sleepStateFallingAsleep(SLEEP_AWAKE, FELL_ASLEEP_AT);

function partAt(state: SleepState, elapsedMilliseconds: number, reducedMotion = false) {
  return sleepPartOf({
    state, elapsedMilliseconds, incomingEyeHeight: 8, reducedMotion
  });
}

describe('the level', () => {
  test('is 0 awake, and an awake Flint gives no part', () => {
    expect(sleepLevelAt(SLEEP_AWAKE, 5000)).toBe(0);
    expect(partAt(SLEEP_AWAKE, 5000)).toBeNull();
    expect(sleepIsActive(SLEEP_AWAKE)).toBe(false);
  });

  test('rises at rate 2.2 towards 1', () => {
    expect(sleepLevelAt(asleep, FELL_ASLEEP_AT)).toBe(0);
    expect(sleepLevelAt(asleep, FELL_ASLEEP_AT + 500)).toBeCloseTo(1 - Math.exp(-1.1), 9);
    expect(sleepLevelAt(asleep, FELL_ASLEEP_AT + 20000)).toBeCloseTo(1, 9);
  });

  test('falls at rate 7 from where it was when Flint wakes', () => {
    const wokeAt = FELL_ASLEEP_AT + 500;
    const waking = sleepStateWaking(asleep, wokeAt);
    const levelAtWake = 1 - Math.exp(-1.1);
    expect(sleepLevelAt(waking, wokeAt)).toBeCloseTo(levelAtWake, 9);
    expect(sleepLevelAt(waking, wokeAt + 100)).toBeCloseTo(levelAtWake * Math.exp(-0.7), 9);
  });

  test('falling asleep again while waking continues from the level it had', () => {
    const waking = sleepStateWaking(asleep, FELL_ASLEEP_AT + 3000);
    const again = sleepStateFallingAsleep(waking, FELL_ASLEEP_AT + 3100);
    expect(sleepLevelAt(again, FELL_ASLEEP_AT + 3100)).toBeCloseTo(sleepLevelAt(waking, FELL_ASLEEP_AT + 3100), 9);
  });

  test('a sleeping Flint keeps its sleep, and an awake Flint stays awake on a wake', () => {
    expect(sleepStateFallingAsleep(asleep, FELL_ASLEEP_AT + 400)).toBe(asleep);
    expect(sleepStateWaking(SLEEP_AWAKE, 400)).toBe(SLEEP_AWAKE);
  });
});

describe('the pose', () => {
  test('while asleep the hover goes to 0 and the lean to -7 degrees at once', () => {
    expect(partAt(asleep, FELL_ASLEEP_AT)?.body).toMatchObject({ hover: 0, leanDegrees: -7 });
  });

  test('a waking Flint gives the hover and the lean back to the layers below', () => {
    const body = partAt(sleepStateWaking(asleep, FELL_ASLEEP_AT + 3000), FELL_ASLEEP_AT + 3000)?.body;
    expect(body).not.toHaveProperty('hover');
    expect(body).not.toHaveProperty('leanDegrees');
  });

  test('the eyes close with the level, from the height the layers below give', () => {
    const elapsedMilliseconds = FELL_ASLEEP_AT + 500;
    const level = sleepLevelAt(asleep, elapsedMilliseconds);
    expect(partAt(asleep, elapsedMilliseconds)?.eyes?.height).toBeCloseTo(8 + ((1.6 - 8) * level), 9);
  });

  test('Flint breathes, and the glow follows the breath and the level', () => {
    const level = sleepLevelAt(asleep, DEEPEST_BREATH_MILLISECONDS);
    const part = partAt(asleep, DEEPEST_BREATH_MILLISECONDS);
    expect(part?.body?.widthFactor).toBeCloseTo(1 + (0.02 * level), 9);
    expect(part?.body?.heightFactor).toBeCloseTo(1 - (0.03 * level), 9);
    expect(part?.sleep?.glowOpacity).toBeCloseTo(level * 0.7, 9);
  });

  test('under reduced motion Flint does not breathe, the glow is steady and no ember rises', () => {
    const level = sleepLevelAt(asleep, DEEPEST_BREATH_MILLISECONDS);
    const part = partAt(asleep, DEEPEST_BREATH_MILLISECONDS, true);
    expect(part?.body).toMatchObject({ widthFactor: 1, heightFactor: 1 });
    expect(part?.sleep?.glowOpacity).toBeCloseTo(level * (0.25 + (0.45 / 2)), 9);
    expect(part?.sleep?.embers).toEqual([]);
  });
});

describe('the embers', () => {
  test('start only once the level is above 0.9', () => {
    expect(embersStartOf(asleep)).toBeCloseTo(FELL_ASLEEP_AT + EMBERS_START_AFTER_MILLISECONDS, 6);
    expect(partAt(asleep, FELL_ASLEEP_AT + EMBERS_START_AFTER_MILLISECONDS - 1)?.sleep?.embers).toEqual([]);
    const embers = partAt(asleep, FELL_ASLEEP_AT + EMBERS_START_AFTER_MILLISECONDS + 100)?.sleep?.embers ?? [];
    expect(embers).toHaveLength(4);
    expect(embers[0]?.opacity).toBeGreaterThan(0);
  });

  test('a sleep that starts above 0.9 starts its embers at once', () => {
    const waking = sleepStateWaking(asleep, FELL_ASLEEP_AT + 20000);
    const again = sleepStateFallingAsleep(waking, FELL_ASLEEP_AT + 20001);
    expect(embersStartOf(again)).toBe(FELL_ASLEEP_AT + 20001);
  });

  test('fade out at rate 7 when Flint wakes, and go on rising while they fade', () => {
    const wokeAt = FELL_ASLEEP_AT + 5000;
    const waking = sleepStateWaking(asleep, wokeAt);
    const risingSince = FELL_ASLEEP_AT + EMBERS_START_AFTER_MILLISECONDS;
    const fullAt = partAt(asleep, wokeAt + 100)?.sleep?.embers ?? [];
    const fadedAt = partAt(waking, wokeAt + 100)?.sleep?.embers ?? [];
    expect(waking).toMatchObject({ fadingEmbers: { fadingSinceMilliseconds: wokeAt } });
    expect(waking.phase === 'waking' ? waking.fadingEmbers?.risingSinceMilliseconds : null).toBeCloseTo(risingSince, 6);
    fadedAt.forEach((ember, i) => {
      expect(ember.x).toBeCloseTo(fullAt[i]?.x ?? Number.NaN, 9);
      expect(ember.opacity).toBeCloseTo((fullAt[i]?.opacity ?? Number.NaN) * Math.exp(-0.7), 9);
    });
  });

  test('a wake before the embers start leaves no ember', () => {
    const waking = sleepStateWaking(asleep, FELL_ASLEEP_AT + 500);
    expect(partAt(waking, FELL_ASLEEP_AT + 600)?.sleep?.embers).toEqual([]);
  });

  test('embers of an earlier sleep go on fading until the new sleep\'s own embers rise', () => {
    const waking = sleepStateWaking(asleep, FELL_ASLEEP_AT + 5000);
    const again = sleepStateFallingAsleep(sleepStateAfterFrame(waking, FELL_ASLEEP_AT + 5300), FELL_ASLEEP_AT + 5300);
    const fading = partAt(again, FELL_ASLEEP_AT + 5300)?.sleep?.embers ?? [];
    expect(fading.some((ember) => ember.opacity > 0)).toBe(true);
    expect(Math.max(...fading.map((ember) => ember.opacity))).toBeLessThan(0.2);
  });

  test('do not mirror with the direction Flint faces', () => {
    const elapsedMilliseconds = FELL_ASLEEP_AT + 4000;
    const embersFacing = (facing: 1 | -1) => composedTargetPose({
      base:    { ...NEUTRAL_POSE, body: { ...NEUTRAL_POSE.body, facing } },
      gesture: () => null,
      emote:   () => null,
      sleep:   (incoming) => sleepPartOf({
        state: asleep, elapsedMilliseconds, incomingEyeHeight: incoming.eyes.height, reducedMotion: false
      }),
      attendants:    [],
      reducedMotion: false,
    }).sleep.embers;
    expect(embersFacing(-1)).toEqual(embersFacing(1));
    expect(embersFacing(-1)[0]?.x).toBeGreaterThan(0);
  });
});

describe('the end of a wake', () => {
  test('a wake that has run its course is awake', () => {
    const wokeAt = FELL_ASLEEP_AT + 5000;
    const waking = sleepStateWaking(asleep, wokeAt);
    expect(sleepStateAfterFrame(waking, wokeAt + 300)).toBe(waking);
    expect(sleepStateAfterFrame(waking, wokeAt + 700)).toBe(SLEEP_AWAKE);
  });

  test('a sleeping Flint drops the embers of an earlier sleep once they have faded out', () => {
    const waking = sleepStateWaking(asleep, FELL_ASLEEP_AT + 5000);
    const again = sleepStateFallingAsleep(waking, FELL_ASLEEP_AT + 5100);
    expect(sleepStateAfterFrame(again, FELL_ASLEEP_AT + 5200)).toBe(again);
    expect(sleepStateAfterFrame(again, FELL_ASLEEP_AT + 6000)).toMatchObject({ phase: 'asleep', fadingEmbers: null });
  });
});
