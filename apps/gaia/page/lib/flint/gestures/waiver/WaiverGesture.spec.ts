/**
 * Waiver against `06-more-animations.md`. What matters: the sheet and its cross fade in; from 400 to 1400 the pen writes the initials from
 * (27, -53), 3 left of the handoff's place so pen and tail stay off the cross and the tick, at their written end + (3, 5), while the eyes
 * look up; the cross greys from 1400 to 1700 and gives way to a grey tick by 1900; then a lean of 7 and one narrower eye with no happy eyes
 * and no hand; the props fade from 2700; reduced motion holds the doubt; and facing left the pen stays right of the written end on the
 * screen, where the initials are mirrored back about their middle.
 */
import { describe, expect, test } from 'bun:test';

import type { Facing }       from '../../SpriteGeometry.ts';
import type { PosePart }     from '../../SpritePose.ts';
import type { GestureInput } from '../GestureDefinition.ts';
import { WAIVER_GESTURE }    from './WaiverGesture.ts';

function partAt(elapsedMilliseconds: number, facing: Facing = 1): PosePart {
  const input: GestureInput = {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
  return WAIVER_GESTURE.targetPose(input);
}

describe('the loop of 3400 ms', () => {
  test('0 to 400: the sheet and the cross fade in, and the pen waits at the start of the initials', () => {
    expect(partAt(200).props?.waiverSheet).toEqual({
      shown: 1, cycleOpacity: 0.5, writtenShare: 0, greyed: 0, waived: 0,
    });
    expect(partAt(200).nearHand).toEqual({
      cornerCount: 3, centreX: 30, centreY: -48, radius: 5.5, turnDegrees: -35, placement: 'eased',
    });
  });

  test('400 to 1400: the pen writes the initials, at their written end + (3, 5), and Flint looks up at them', () => {
    const part = partAt(900);
    expect(part.props?.waiverSheet?.writtenShare).toBe(0.5);
    expect(part.eyes).toEqual({ shift: 6, height: 6, lift: -4 });
    expect(part.body).toEqual({ leanDegrees: 5 });
    const done = partAt(1400).nearHand;
    expect(done?.centreX).toBeCloseTo(38.5);
    expect(done?.centreY).toBeCloseTo(-47);
  });

  test('1400 to 1700: the cross greys; 1700 to 1900: it fades out as the grey tick fades in', () => {
    expect(partAt(1550).props?.waiverSheet).toMatchObject({ writtenShare: 1, greyed: 0.5, waived: 0 });
    expect(partAt(1800).props?.waiverSheet).toMatchObject({ greyed: 1, waived: 0.5 });
    expect(partAt(1899).nearHand).not.toBeNull();
  });

  test('1900 to 2700: a lean of 7 and one narrower eye, no happy eyes, and the hand goes away', () => {
    const part = partAt(1900);
    expect(part.nearHand).toBeNull();
    expect(part.body).toEqual({ leanDegrees: 7 });
    expect(part.eyes).toEqual({ shift: 6, rightHeightOverride: 5 });
    expect(part.props?.waiverSheet?.waived).toBe(1);
  });

  test('2700 to 3400: the props fade out', () => {
    expect(partAt(3050).props?.waiverSheet?.cycleOpacity).toBe(0.5);
    expect(partAt(3050).body).toEqual({ leanDegrees: 5 });
  });

  test('the loop repeats', () => {
    expect(partAt(3400 + 900)).toEqual(partAt(900));
  });
});

test('reduced motion holds the grey tick and the look of doubt', () => {
  expect(WAIVER_GESTURE.intents.waiver).toEqual({ variant: 'normal', durationMilliseconds: null, stillMomentMilliseconds: 2200 });
  const part = partAt(2200);
  expect(part.props?.waiverSheet).toMatchObject({ writtenShare: 1, waived: 1, cycleOpacity: 1 });
  expect(part.eyes?.happiness).toBeUndefined();
});

test('facing left the pen is right of the written end on the screen, turned 35 degrees; the sheet is the same', () => {
  const start = partAt(200, -1).nearHand;
  expect(start).toMatchObject({ centreX: 32.5, turnDegrees: 35 });
  const done = partAt(1400, -1).nearHand;
  expect(done?.centreX).toBeCloseTo(24);
  expect(partAt(900, -1).props).toEqual(partAt(900, 1).props);
});
