/**
 * Escaped bug. What matters: the shelf and block fade in and the block rocks; the bug
 * escapes at 0.7 s with the "!", wide eyes and one hop, and runs its route through each point at its moment; the glaring eyes follow it;
 * the hand falls exactly onto each hit point, misses twice and has the bug on the third; it lifts the bug around the shelf and the block,
 * never through them, to above the block, and the trace shows; the cycle repeats every 4.6 s; and reduced motion holds the lifted bug
 * with its trace.
 */
import { describe, expect, test } from 'bun:test';

import type { Facing }         from '../../SpriteGeometry.ts';
import type { GestureInput }   from '../GestureDefinition.ts';
import { ESCAPED_BUG_GESTURE } from './EscapedBugGesture.ts';

function partAt(elapsedMilliseconds: number, facing: Facing = 1): ReturnType<typeof ESCAPED_BUG_GESTURE.targetPose> {
  const input: GestureInput<'normal'> = {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
  return ESCAPED_BUG_GESTURE.targetPose(input);
}

describe('the cycle', () => {
  test('0 to 0.3 s the shelf and the block fade in; 0.3 to 0.7 s the block rocks by 4 × sin(6π × p); no bug yet', () => {
    expect(partAt(150).props?.escapedBug).toMatchObject({ sceneOpacity: 0.5, blockTurnDegrees: 0, bugOpacity: 0 });
    expect(partAt(300 + (400 / 12)).props?.escapedBug?.blockTurnDegrees).toBeCloseTo(4);
    expect(partAt(150).nearHand).toBeNull();
  });

  test('at 0.7 s the bug leaves the block at (43, -28), with eye height 10, the "!" on its spring and one hop', () => {
    const part = partAt(700);
    expect(part.props?.escapedBug).toMatchObject({ bugX: 43, bugY: -28, bugOpacity: 1 });
    expect(part.eyes).toMatchObject({ height: 10 });
    expect(part.emoteMark).toMatchObject({ name: 'exclamation', innerScaleX: 0 });
    expect(partAt(850).body?.addedLift).toBeCloseTo(6);
    expect(partAt(1000).body?.addedLift).toBeUndefined();
  });

  test('0.7 to 2.6 s the bug runs in straight lines, reaching each point at its moment', () => {
    for (const [moment, bugX, bugY] of [[1100, 52, -26], [1400, 48, -6], [1900, 28, -6], [2300, 40, -6], [2600, 34, -6], [1650, 38, -6]] as const) {
      expect(partAt(moment).props?.escapedBug).toMatchObject({ bugX, bugY });
    }
  });

  test('while Flint chases, the eyes glare and follow the bug: height 4, slant 12, shift 4 + (bug x - 26) / 8', () => {
    expect(partAt(1100).eyes).toEqual({ shift: 7.25, height: 4, slantDegrees: 12 });
  });

  test('the hand falls exactly onto each hit point: (46, -8) and (30, -8) miss the bug', () => {
    expect(partAt(1450).nearHand).toMatchObject({
      cornerCount: 5, radius: 6.5, centreX: 46, centreY: -16, placement: 'eased'
    });
    expect(partAt(1600).nearHand).toMatchObject({ centreX: 46, centreY: -8, placement: 'exact-position' });
    expect(partAt(1540).nearHand).toMatchObject({ centreX: 46, centreY: -12, placement: 'exact-position' });
    expect(partAt(1600).props?.escapedBug?.bugX).toBe(40);
    expect(partAt(2150).nearHand).toMatchObject({ centreX: 30, centreY: -8, placement: 'exact-position' });
    expect(partAt(2150).props?.escapedBug?.bugX).toBe(35.5);
  });

  test('at 2.6 s the hand hits (34, -8) and has the bug, which hangs just below it', () => {
    const part = partAt(2600);
    expect(part.nearHand?.placement).toEqual({ heldTo: 'escapedBug' });
    expect(part.props?.escapedBug).toMatchObject({ bugX: 34, bugY: -6, bugBelowHand: 2 });
  });

  test('2.6 to 3.2 s the hand lifts the bug around the shelf and the block, never over them, to above the block', () => {
    for (let time = 2600; time <= 3200; time += 20) {
      const bug = partAt(time).props?.escapedBug;
      const isOverBlockOrShelf = (bug?.bugX ?? 0) < 54 + 3 && (bug?.bugY ?? 0) > -32 - 3 && (bug?.bugY ?? 0) < -24 + 3;
      expect(isOverBlockOrShelf).toBe(false);
    }
  });

  test('2.6 to 3.2 s the hand lifts the bug above the block, with eye height 6', () => {
    expect(partAt(3200).props?.escapedBug).toMatchObject({
      bugX: 34, bugY: -42, bugBelowHand: 7.5, traceOpacity: 1
    });
    expect(partAt(2900).eyes).toEqual({ shift: 6, height: 6, slantDegrees: 0 });
  });

  test('3.2 to 3.8 s the trace and the warning triangle show, with eye slant 8; then the props fade and the hand goes', () => {
    expect(partAt(3500).eyes?.slantDegrees).toBe(8);
    expect(partAt(3100).props?.escapedBug?.traceOpacity).toBe(0);
    expect(partAt(4200).props?.escapedBug).toMatchObject({ sceneOpacity: 0.5, traceOpacity: 0.5, bugOpacity: 0.5 });
    expect(partAt(3800).nearHand).toBeNull();
  });

  test('the cycle repeats every 4.6 s; only the wiggle runs on the gesture\'s own time', () => {
    const withoutWiggle = (moment: number): unknown => {
      const part = partAt(moment);
      return { ...part, props: { escapedBug: { ...part.props?.escapedBug, bugTurnDegrees: null } } };
    };
    for (const moment of [150, 1100, 2150, 3500]) expect(withoutWiggle(4600 + moment)).toEqual(withoutWiggle(moment));
  });
});

test('facing left gives the same part: the renderer mirrors the chase, and nothing in it is read or written', () => {
  for (const moment of [700, 1600, 3500]) expect(partAt(moment, -1)).toEqual(partAt(moment, 1));
});

test('one intent, a loop; reduced motion holds the lifted bug above the block with its trace', () => {
  expect(ESCAPED_BUG_GESTURE.intents).toMatchObject({ 'escaped-bug': { variant: 'normal', durationMilliseconds: null, stillMomentMilliseconds: 3500 } });
  const still = partAt(ESCAPED_BUG_GESTURE.intents['escaped-bug'].stillMomentMilliseconds);
  expect(still.nearHand?.placement).toEqual({ heldTo: 'escapedBug' });
  expect(still.props?.escapedBug).toMatchObject({
    bugOpacity: 1, bugX: 34, bugY: -42, traceOpacity: 1,
  });
});
