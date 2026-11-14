/**
 * Bug jar against `06-more-animations.md`, "Bug jar". What matters: the lens reads line 0 and stops on line 1 at 0.6 of it, at 0.7 s for
 * a line, from left to right on the screen whatever the facing; the bug shows below the stopped lens with the "!" and wide eyes; the lens
 * leaves with its hand and a pentagon comes back to the bug; the caught bug wiggles twice as fast from the catch on, with no jump in its
 * turn, is carried above the jar, falls in, and
 * the lid closes; the jar shrinks into a low ticket that leaves by (12, -4) while the sheet fades; the cycle repeats every 5.2 s; and
 * reduced motion holds the caught bug on its way to the open jar.
 */
import { describe, expect, test } from 'bun:test';

import type { Facing }       from '../../SpriteGeometry.ts';
import { BugShapeUtil }      from '../../props/shapes/BugShapeUtil.ts';
import type { GestureInput } from '../GestureDefinition.ts';
import { BUG_JAR_GESTURE }   from './BugJarGesture.ts';

function partAt(elapsedMilliseconds: number, facing: Facing = 1): ReturnType<typeof BUG_JAR_GESTURE.targetPose> {
  const input: GestureInput<'normal'> = {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
  return BUG_JAR_GESTURE.targetPose(input);
}

describe('the cycle', () => {
  test('0 to 1.4 s: the lens reads line 0, then line 1, at 0.7 s for a line, held in the pentagon of Review', () => {
    const part = partAt(630);
    expect(part.props?.lookingGlass).toEqual({ shown: 1, centreX: 37.5, centreY: -36.6 });
    expect(part.props?.sheet).toMatchObject({ shown: 1, readLineIndex: 0, verdict: null });
    expect(part.nearHand).toMatchObject({ cornerCount: 5, radius: 5, placement: { heldTo: 'lookingGlass' } });
    expect(part.eyes).toEqual({ height: 6, lift: -2, shift: 6 });
    expect(part.body).toEqual({ leanDegrees: 5 });
  });

  test('at 1.4 s the lens stops on line 1 at 0.6; the bug shows below it, with eye height 10 and the "!" on its spring', () => {
    const part = partAt(1400);
    expect(part.props?.lookingGlass?.centreX).toBeCloseTo(38.8);
    expect(part.props?.lookingGlass?.centreY).toBeCloseTo(-29.32);
    expect(part.props?.sheet?.readLineIndex).toBe(1);
    expect(part.props?.bugJar).toMatchObject({ bugOpacity: 1, jarOpacity: 0 });
    expect(part.props?.bugJar?.bugX).toBeCloseTo(38.8);
    expect(part.props?.bugJar?.bugY).toBeCloseTo(-20.82);
    expect(part.eyes?.height).toBe(10);
    expect(part.emoteMark).toMatchObject({ name: 'exclamation', innerScaleX: 0, opacity: 1 });
    expect(partAt(1500).emoteMark?.innerScaleX).toBe(1 + ((2 ** -5) * Math.sin(4.25 * 2.094)));
  });

  test('before the find there is no bug and no mark', () => {
    expect(partAt(1300).props?.bugJar?.bugOpacity).toBe(0);
    expect(partAt(1300).emoteMark).toBeUndefined();
  });

  test('1.4 to 1.8 s: the bug runs once around a circle of 1.5 below the lens', () => {
    const halfway = partAt(1600).props?.bugJar;
    expect(halfway?.bugX).toBeCloseTo(38.8 + 3);
    expect(halfway?.bugY).toBeCloseTo(-20.82);
    expect(partAt(1800).props?.bugJar?.bugX).toBeCloseTo(38.8);
  });

  test('1.8 to 2.3 s: the lens moves to (50, -48) and fades with its hand, and a pentagon goes to the bug', () => {
    const leaving = partAt(1925);
    expect(leaving.props?.lookingGlass?.shown).toBeCloseTo(0.75);
    expect(leaving.nearHand).toMatchObject({ radius: 2.5, placement: { heldTo: 'lookingGlass' } });
    expect(partAt(2300).props?.lookingGlass).toEqual({ shown: 0, centreX: 50, centreY: -48 });
    const reaching = partAt(2200);
    expect(reaching.nearHand).toMatchObject({ cornerCount: 5, radius: 5, placement: 'eased' });
    expect(reaching.nearHand?.centreX).toBeCloseTo(38.8 - 6);
    expect(reaching.nearHand?.centreY).toBeCloseTo(-20.82);
  });

  test('at 2.3 s the hand has the bug, which wiggles twice as fast; the jar fades in with its lid open', () => {
    const caught = partAt(2300);
    expect(caught.nearHand?.placement).toEqual({ heldTo: 'bugJar' });
    expect(caught.props?.bugJar?.bugTurnDegrees).toBe(BugShapeUtil.wiggleDegreesAt(2300));
    expect(partAt(2200).props?.bugJar?.bugTurnDegrees).toBe(BugShapeUtil.wiggleDegreesAt(2200));
    expect(partAt(2400).props?.bugJar?.bugTurnDegrees).toBe(BugShapeUtil.wiggleDegreesAt(2300 + (2 * 100)));
    expect(partAt(5200 + 2400).props?.bugJar?.bugTurnDegrees).toBe(BugShapeUtil.wiggleDegreesAt(5200 + 2300 + (2 * 100)));
    expect(partAt(2450).props?.bugJar).toMatchObject({ jarOpacity: 0.5, lidLift: 6, jarScale: 1 });
    expect(partAt(2450).emoteMark).toBeUndefined();
  });

  test('2.3 to 3 s the hand carries the bug above the jar; 3 to 3.3 s it falls in, and at 3.3 s the lid closes', () => {
    expect(partAt(3000).props?.bugJar).toMatchObject({ bugX: 44, bugY: -22, lidLift: 6 });
    expect(partAt(3150).props?.bugJar?.bugY).toBeCloseTo(-22 + (13 * 0.25));
    expect(partAt(3000).nearHand).toMatchObject({ centreX: 38, centreY: -22, placement: 'eased' });
    expect(partAt(3300).props?.bugJar).toMatchObject({ bugY: -9, lidLift: 0 });
    expect(partAt(3300).nearHand).toBeNull();
  });

  test('the eyes follow the bug from the catch, and are happy from 3.4 s to the end of the cycle', () => {
    expect(partAt(3000).eyes).toEqual({ height: 6, shift: 6, lift: 0.25 });
    expect(partAt(3399).eyes?.happiness).toBeUndefined();
    expect(partAt(3400).eyes?.happiness).toBe(1);
    expect(partAt(5100).eyes?.happiness).toBe(1);
  });

  test('3.7 to 4.2 s the jar and the bug shrink away and the low ticket fades in at (44, -12)', () => {
    expect(partAt(3950).props?.bugJar).toMatchObject({ jarScale: 0.5, ticketOpacity: 0.5, ticketOffsetX: 0 });
    expect(partAt(3950).props?.bugJar?.ticketOffsetY).toBeCloseTo(0);
    expect(partAt(4200).props?.bugJar).toMatchObject({
      jarScale: 0, jarOpacity: 0, bugOpacity: 0, ticketOpacity: 1
    });
  });

  test('4.2 to 5.2 s the ticket moves by (12, -4) and fades out, and the sheet fades out', () => {
    const part = partAt(4700);
    expect(part.props?.bugJar).toMatchObject({ ticketOpacity: 0.5, ticketOffsetX: 6, ticketOffsetY: -2 });
    expect(part.props?.sheet?.shown).toBe(0.5);
  });

  test('the cycle repeats every 5.2 s; only the wiggle runs on the gesture\'s own time', () => {
    const withoutWiggle = (moment: number): unknown => {
      const part = partAt(moment);
      return { ...part, props: { ...part.props, bugJar: { ...part.props?.bugJar, bugTurnDegrees: null } } };
    };
    for (const moment of [630, 1600, 2600, 3950]) expect(withoutWiggle(5200 + moment)).toEqual(withoutWiggle(moment));
  });
});

test('facing left, the lens reads from the left of the screen: it stops at 0.6 across on the screen, and the bug shows below it', () => {
  const part = partAt(1400, -1);
  expect(part.props?.lookingGlass?.centreX).toBeCloseTo(31 + (13 * 0.4));
  expect(part.props?.lookingGlass?.centreY).toBeCloseTo(-39 + 7 + (2.8 * 0.4) + 1);
  expect(part.props?.bugJar?.bugX).toBeCloseTo(31 + (13 * 0.4));
  expect(part.eyes?.shift).toBeCloseTo(5 + (2 * 0.4));
});

test('one intent, a loop; reduced motion holds the caught bug on its way to the open jar', () => {
  expect(BUG_JAR_GESTURE.intents).toEqual({ 'bug-jar': { variant: 'normal', durationMilliseconds: null, stillMomentMilliseconds: 2600 } });
  const still = partAt(BUG_JAR_GESTURE.intents['bug-jar'].stillMomentMilliseconds);
  expect(still.nearHand?.placement).toEqual({ heldTo: 'bugJar' });
  expect(still.props?.bugJar).toMatchObject({ bugOpacity: 1, jarOpacity: 1, lidLift: 6 });
  expect(BUG_JAR_GESTURE.continuesWhileWalking).toBe(false);
  expect(BUG_JAR_GESTURE.continuesWhileJumping).toBe(false);
});
