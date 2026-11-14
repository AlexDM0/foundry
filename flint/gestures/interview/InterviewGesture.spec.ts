/**
 * Interview against `06-more-animations.md`. What matters: in each of the two rounds of 2200 ms Flint first asks (lean 3, eyes to the user,
 * one eye narrower, the question mark with its spring and its fade), then nods two times in 350 ms each, then writes line r of the
 * notepad with the notes study's pen and eyes; from 4400 one more nod, the happy eyes and the tick; from 5000 the lines and the tick fade;
 * reduced motion holds the pen in the first line; facing left the line still grows to the right on the screen.
 */
import { describe, expect, test } from 'bun:test';

import type { Facing }       from '../../SpriteGeometry.ts';
import type { PosePart }     from '../../SpritePose.ts';
import type { GestureInput } from '../GestureDefinition.ts';
import { INTERVIEW_GESTURE } from './InterviewGesture.ts';

function partAt(elapsedMilliseconds: number, facing: Facing = 1): PosePart {
  const input: GestureInput = {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
  return INTERVIEW_GESTURE.targetPose(input);
}

describe('a round', () => {
  test('0 to 800: Flint asks, facing the user with one eye narrower, and the question mark shows', () => {
    const part = partAt(400);
    expect(part.body).toEqual({ leanDegrees: 3 });
    expect(part.eyes).toEqual({ shift: 0, height: 8, rightHeightOverride: 6 });
    expect(part.nearHand).toBeNull();
    expect(part.emoteMark).toMatchObject({
      name: 'question', opacity: 1, innerScaleX: 1, scale: 1.5
    });
  });

  test('the question mark springs in on its width and fades and shrinks in the last 160 ms of the asking', () => {
    expect(partAt(100).emoteMark?.innerScaleX).toBeGreaterThan(1);
    expect(partAt(720).emoteMark?.opacity).toBe(0.5);
    expect(partAt(720).emoteMark?.scale).toBeCloseTo(1.5 * 0.8);
    expect(partAt(800).emoteMark).toBeUndefined();
  });

  test('800 to 1500: Flint listens and nods two times, the lean out to 6 and back in 350 ms each', () => {
    expect(partAt(975).body?.leanDegrees).toBeCloseTo(6);
    expect(partAt(1150).body?.leanDegrees).toBeCloseTo(0);
    expect(partAt(1325).body?.leanDegrees).toBeCloseTo(6);
    expect(partAt(975).eyes).toEqual({ shift: 0, height: 6 });
    expect(partAt(975).nearHand).toBeNull();
  });

  test('1500 to 2200: Flint writes line 0 with the pen of the notes study, lean 5, looking down at the line', () => {
    const part = partAt(1850);
    expect(part.props?.interviewNotepad?.writtenLengths).toEqual([5, 0, 0]);
    expect(part.nearHand).toMatchObject({
      cornerCount: 3, centreX: 41, radius: 5.5, turnDegrees: -35
    });
    expect(part.body).toEqual({ leanDegrees: 5 });
    expect(part.eyes).toEqual({ shift: 6, height: 6, lift: -1 });
  });

  test('the second round asks again with line 0 written, and writes line 1', () => {
    expect(partAt(2600).emoteMark?.name).toBe('question');
    expect(partAt(2600).props?.interviewNotepad?.writtenLengths).toEqual([10, 0, 0]);
    expect(partAt(4050).props?.interviewNotepad?.writtenLengths).toEqual([10, 5, 0]);
    expect(partAt(4050).eyes?.lift).toBe(0);
  });
});

describe('the end', () => {
  test('4400 to 5000: one more nod, the happy eyes and the tick, and no hand', () => {
    const part = partAt(4575);
    expect(part.body?.leanDegrees).toBeCloseTo(6);
    expect(part.eyes?.happiness).toBe(1);
    expect(part.nearHand).toBeNull();
    expect(part.props?.interviewNotepad).toEqual({
      shown: 1, writtenLengths: [10, 10, 0], linesOpacity: 1, tickOpacity: 1,
    });
    expect(partAt(4800).body?.leanDegrees).toBe(0);
  });

  test('5000 to 5600: the written lines and the tick fade out while the notepad stays; the happy eyes end', () => {
    const part = partAt(5300);
    expect(part.props?.interviewNotepad).toMatchObject({ shown: 1, linesOpacity: 0.5, tickOpacity: 0.5 });
    expect(part.eyes?.happiness).toBeUndefined();
  });

  test('the loop repeats, but for the wobble of the pen', () => {
    const again = partAt(5600 + 1850);
    const first = partAt(1850);
    expect([again.props, again.eyes, again.body, again.nearHand?.centreX]).toEqual([first.props, first.eyes, first.body, first.nearHand?.centreX]);
  });
});

test('reduced motion holds the pen in the middle of the first line', () => {
  expect(INTERVIEW_GESTURE.intents.interview).toEqual({ variant: 'normal', durationMilliseconds: null, stillMomentMilliseconds: 1800 });
  expect(partAt(1800).props?.interviewNotepad?.writtenLengths[0]).toBeCloseTo(10 * (300 / 700));
  expect(partAt(1800).nearHand?.cornerCount).toBe(3);
});

test('facing left the line grows from its left end on the screen and the pen is right of it, turned 35 degrees', () => {
  const part = partAt(1850, -1);
  expect(part.props?.interviewNotepad?.writtenLengths).toEqual([5, 0, 0]);
  expect(part.nearHand).toMatchObject({ centreX: 35, turnDegrees: 35 });
});
