/**
 * Review: each variant's pace, pages and verdicts, the lens and eyes following the line being read, and the angry and busy details. Facing
 * left Flint still reads left to right, and the looking glass's hand sits exactly on the drawn lens.
 */
import { describe, expect, test } from 'bun:test';

import { poseWithPart }        from '../../PoseComposition.ts';
import { easedPoseOf }         from '../../PoseEasing.ts';
import type { Facing }         from '../../SpriteGeometry.ts';
import type { PosePart }       from '../../SpritePose.ts';
import { NEUTRAL_POSE }        from '../../SpritePose.ts';
import type { GestureInput }   from '../GestureDefinition.ts';
import type { WorkingVariant } from '../WorkingVariantPart.ts';
import { REVIEW_GESTURE }      from './ReviewGesture.ts';

const FRAME_MILLISECONDS = 16;

function partAt(elapsedMilliseconds: number, variant: WorkingVariant, facing: Facing = 1): PosePart {
  const input: GestureInput<WorkingVariant> = {
    elapsedMilliseconds, variant, facing, sidewaysWidth: 1, target: null, verdict: null,
  };
  return REVIEW_GESTURE.targetPose(input);
}

/** The height of a line where the lens is: over the lens travel of 13 units from x 31, the line height drops 2.8. */
function lineYUnderLens(lineIndex: number, lensX: number): number {
  return -39 + (7 * lineIndex) + (2.8 * ((lensX - 31) / 13));
}

describe('reading a line, facing right', () => {
  test('halfway along line 0 of the normal variant, the lens is at (37.5, line y + 1) and the line is drawn as read', () => {
    const part = partAt(400, 'normal');
    expect(part.props?.lookingGlass?.shown).toBe(1);
    expect(part.props?.lookingGlass?.centreX).toBeCloseTo(31 + (13 * 0.5));
    expect(part.props?.lookingGlass?.centreY).toBeCloseTo(-39 + (2.8 * 0.5) + 1);
    expect(part.props?.sheet).toEqual({
      shown: 1, readLineIndex: 0, stackedPageCount: 0, offsetY: 0, verdict: null,
    });
  });

  test('one pentagon of radius 5 holds the glass at the lens + (-8, 8); there is no second hand', () => {
    const part = partAt(400, 'normal');
    expect(part.nearHand).toMatchObject({
      cornerCount: 5, radius: 5, turnDegrees: 0, placement: { heldTo: 'lookingGlass' },
    });
    expect(part.nearHand?.centreX).toBeCloseTo((part.props?.lookingGlass?.centreX ?? Number.NaN) - 8);
    expect(part.nearHand?.centreY).toBeCloseTo((part.props?.lookingGlass?.centreY ?? Number.NaN) + 8);
    expect(part.farHand).toBeNull();
  });

  test('Flint reads line 0 to line 3 in turn; the eye lift is -2 + 1.4 × line and the eye shift 5 + 2 × along', () => {
    for (const lineIndex of [0, 1, 2, 3]) {
      const part = partAt((lineIndex * 800) + 200, 'normal');
      expect(part.props?.sheet?.readLineIndex).toBe(lineIndex);
      expect(part.eyes?.lift).toBeCloseTo(-2 + (1.4 * lineIndex));
      expect(part.eyes?.shift).toBeCloseTo(5 + (2 * 0.25));
      expect(part.eyes?.height).toBe(6);
    }
  });

  test('the lens follows the slope of the line it reads, one unit below its line height', () => {
    for (let elapsedMilliseconds = 0; elapsedMilliseconds < 3200; elapsedMilliseconds += 61) {
      const part = partAt(elapsedMilliseconds, 'normal');
      const lens = part.props?.lookingGlass;
      expect((lens?.centreY ?? Number.NaN) - 1).toBeCloseTo(lineYUnderLens(part.props?.sheet?.readLineIndex ?? Number.NaN, lens?.centreX ?? Number.NaN));
    }
  });
});

describe('reading direction facing left', () => {
  test('the lens moves from left to right on the screen along each line, whichever way Flint faces', () => {
    for (const facing of [1, -1] as const) {
      const screenXs = [50, 250, 450, 750].map((elapsedMilliseconds) => facing * (partAt(elapsedMilliseconds, 'normal', facing).props?.lookingGlass?.centreX ?? Number.NaN));
      expect(screenXs).toEqual([...screenXs].sort((a, b) => a - b));
    }
  });

  test('facing left, 1 - along takes the place of along for the lens, the line height and the eye shift', () => {
    const part = partAt(200, 'normal', -1);
    expect(part.props?.lookingGlass?.centreX).toBeCloseTo(31 + (13 * 0.75));
    expect(part.props?.lookingGlass?.centreY).toBeCloseTo(-39 + (2.8 * 0.75) + 1);
    expect(part.eyes?.shift).toBeCloseTo(5 + (2 * 0.75));
  });

  test('facing left, Flint gives the same verdict at the same moment; the renderer keeps the tick unmirrored', () => {
    for (const elapsedMilliseconds of [3500, 7500]) {
      const facingRight = partAt(elapsedMilliseconds, 'normal', 1).props?.sheet?.verdict;
      expect(facingRight).not.toBeNull();
      expect(partAt(elapsedMilliseconds, 'normal', -1).props?.sheet?.verdict).toBe(facingRight ?? null);
    }
  });
});

describe('the normal variant', () => {
  test('after 3.2 seconds of reading, the verdict shows for 0.8 seconds with no line read: first a tick, with happy eyes', () => {
    const part = partAt(3500, 'normal');
    expect(part.props?.sheet?.verdict).toBe('tick');
    expect(part.props?.sheet?.readLineIndex).toBeNull();
    expect(part.eyes?.happiness).toBe(1);
    expect(part.body?.leanDegrees).toBe(5);
  });

  test('the next cycle ends in a cross: the eyes are 4 high and the body leans 9', () => {
    const part = partAt(4000 + 3500, 'normal');
    expect(part.props?.sheet?.verdict).toBe('cross');
    expect(part.eyes?.height).toBe(4);
    expect(part.eyes?.happiness).toBeUndefined();
    expect(part.body?.leanDegrees).toBe(9);
  });

  test('a new cycle starts reading line 0 again', () => {
    expect(partAt(4000, 'normal').props?.sheet).toMatchObject({ readLineIndex: 0, verdict: null });
  });
});

describe('the busy variant', () => {
  test('0.28 seconds a line and 0.35 for the verdict, one page behind the sheet, lean 9, eyes 4 high, and the bob', () => {
    const part = partAt(300, 'busy');
    expect(part.props?.sheet?.readLineIndex).toBe(1);
    expect(part.props?.sheet?.stackedPageCount).toBe(1);
    expect(part.body?.leanDegrees).toBe(9);
    expect(part.body?.addedLift).toBeCloseTo(0.8 * Math.sin(300 / 50));
    expect(part.eyes?.height).toBe(4);
    expect(partAt(1120, 'busy').props?.sheet?.verdict).toBe('tick');
    expect(partAt(1470 + 1120, 'busy').props?.sheet?.verdict).toBe('cross');
  });

  test('during the verdict the sheet moves up by 6 × sin(π × verdict progress), as if Flint turns the page', () => {
    expect(partAt(1120 + 175, 'busy').props?.sheet?.offsetY).toBeCloseTo(-6);
    expect(partAt(1120 + 70, 'busy').props?.sheet?.offsetY).toBeCloseTo(-6 * Math.sin(Math.PI * 0.2));
    expect(partAt(500, 'busy').props?.sheet?.offsetY).toBe(0);
  });
});

describe('the angry variant', () => {
  test('0.5 seconds a line and 0.9 for the verdict, three pages behind the sheet, and always a cross', () => {
    expect(partAt(1600, 'angry').props?.sheet?.readLineIndex).toBe(3);
    for (const cycleIndex of [0, 1, 2]) {
      const part = partAt((cycleIndex * 2900) + 2400, 'angry');
      expect(part.props?.sheet?.verdict).toBe('cross');
      expect(part.props?.sheet?.stackedPageCount).toBe(3);
    }
  });

  test('lean 7, eyes 7 high and slanted 20, the shake and the vein, with no happy eyes', () => {
    const part = partAt(2400, 'angry');
    expect(part.body?.leanDegrees).toBe(7);
    expect(part.body?.addedShake).toBeCloseTo(0.8 * Math.sin(2400 / 28));
    expect(part.eyes?.height).toBe(7);
    expect(part.eyes?.slantDegrees).toBe(20);
    expect(part.eyes?.happiness).toBeUndefined();
    expect(part.emoteMark?.name).toBe('anger-vein');
  });

  test('the jab 3 × max(0, sin(t / 45)) comes off the lens x and y, and the sheet moves down by half of it', () => {
    const jabMilliseconds = 45 * Math.PI / 2;
    const jabbed = partAt(jabMilliseconds, 'angry');
    const along = jabMilliseconds / 500;
    expect(jabbed.props?.lookingGlass?.centreX).toBeCloseTo(31 + (13 * along) - 3);
    expect(jabbed.props?.lookingGlass?.centreY).toBeCloseTo(-39 + (2.8 * along) + 1 - 3);
    expect(jabbed.props?.sheet?.offsetY).toBeCloseTo(1.5);
    const withdrawn = partAt(45 * Math.PI * 1.5, 'angry');
    expect(withdrawn.props?.sheet?.offsetY).toBe(0);
  });
});

describe('the hand of the looking glass', () => {
  test('on every frame the drawn hand is exactly at the drawn lens + (-8, 8), while the lens eases towards its target', () => {
    let drawn = NEUTRAL_POSE;
    let lensLagged = false;
    for (let elapsedMilliseconds = 0; elapsedMilliseconds < 3000; elapsedMilliseconds += FRAME_MILLISECONDS) {
      const target = poseWithPart(NEUTRAL_POSE, partAt(elapsedMilliseconds, 'angry'));
      drawn = easedPoseOf(drawn, target, FRAME_MILLISECONDS);
      const lens = drawn.props.lookingGlass;
      expect(drawn.nearHand?.centreX).toBeCloseTo(lens.centreX - 8, 10);
      expect(drawn.nearHand?.centreY).toBeCloseTo(lens.centreY + 8, 10);
      lensLagged ||= Math.abs(lens.centreX - target.props.lookingGlass.centreX) > 0.1;
    }
    expect(lensLagged).toBe(true);
  });
});
