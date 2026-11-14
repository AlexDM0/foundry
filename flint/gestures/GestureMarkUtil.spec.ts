/**
 * The marks a gesture shows during one step. What matters: no mark before or after its step; inside it, the mark enters as its emote brings
 * it in (the spring on the width, the sweat drop's growth and slide, the thinking dots one by one, the beads flying) timed from the step's
 * start, the dots faster in a step too short for them, and leaves as an emote's mark leaves, in the last 160 ms of the step, so every
 * gesture that shows a mark shows it alike.
 */
import { describe, expect, test } from 'bun:test';

import { SPRING }             from '../constants/Motion.ts';
import { DOUBT_EMOTE }        from '../emotes/doubt/DoubtEmote.ts';
import { NERVOUS_EMOTE }      from '../emotes/nervous/NervousEmote.ts';
import { SWEATDROP_EMOTE }    from '../emotes/sweatdrop/SweatdropEmote.ts';
import { THINKING_EMOTE }     from '../emotes/thinking/ThinkingEmote.ts';
import { AnimationCurveUtil } from '../utils/AnimationCurveUtil.ts';
import { GestureMarkUtil }    from './GestureMarkUtil.ts';

const STEP = { startMilliseconds: 1000, endMilliseconds: 2500 };
const emoteInputAt = (ageMilliseconds: number) => ({ ageMilliseconds, facing: 1 as const, reducedMotion: false });

describe('the step', () => {
  test('no mark before the step starts, and none once it ends', () => {
    expect(GestureMarkUtil.springingMarkIn('question', 999, STEP)).toBeNull();
    expect(GestureMarkUtil.springingMarkIn('question', 2500, STEP)).toBeNull();
    expect(GestureMarkUtil.sweatDropIn(999, STEP)).toBeNull();
    expect(GestureMarkUtil.thinkingDotsIn(2500, STEP)).toBeNull();
    expect(GestureMarkUtil.sweatBeadsIn(2600, STEP)).toBeNull();
  });

  test('the mark shows whole until the last 160 ms of the step, then fades out', () => {
    expect(GestureMarkUtil.springingMarkIn('exclamation', 2340, STEP)?.opacity).toBe(1);
    expect(GestureMarkUtil.springingMarkIn('exclamation', 2420, STEP)?.opacity).toBeCloseTo(0.5, 6);
  });
});

describe('each mark enters as its emote brings it in, timed from the step', () => {
  test('the "?" springs on its width, as in Doubt, whose step is the emote\'s 1500 ms', () => {
    expect<unknown>(GestureMarkUtil.springingMarkIn('question', 1100, STEP)).toEqual(DOUBT_EMOTE.targetPose(emoteInputAt(100)).emoteMark ?? null);
    expect(GestureMarkUtil.springingMarkIn('question', 1100, STEP)?.innerScaleX).toBe(AnimationCurveUtil.springScaleAt(100 / SPRING.DURATION_MILLISECONDS));
  });

  test('the sweat drop grows and slides as in the Sweatdrop emote', () => {
    expect<unknown>(GestureMarkUtil.sweatDropIn(1600, STEP)).toEqual(SWEATDROP_EMOTE.targetPose(emoteInputAt(600)).emoteMark ?? null);
  });

  test('the thinking dots show one by one as in the Thinking emote', () => {
    expect<unknown>(GestureMarkUtil.thinkingDotsIn(1700, STEP)?.details).toEqual(THINKING_EMOTE.targetPose(emoteInputAt(700)).emoteMark?.details);
  });

  test('in a step too short for their entrance, the dots follow each other faster, so the third shows whole before the exit', () => {
    const shortStep = { startMilliseconds: 1000, endMilliseconds: 2200 };
    expect(GestureMarkUtil.thinkingDotsIn(1100, shortStep)?.details).toEqual({ dotsShown: 0 });
    expect(GestureMarkUtil.thinkingDotsIn(1850, shortStep)).toMatchObject({ details: { dotsShown: 3 }, opacity: 1 });
  });

  test('the sweat beads fly off as in the Nervous emote', () => {
    expect<unknown>(GestureMarkUtil.sweatBeadsIn(1400, STEP)?.details).toEqual(NERVOUS_EMOTE.targetPose(emoteInputAt(400)).emoteMark?.details);
  });
});
