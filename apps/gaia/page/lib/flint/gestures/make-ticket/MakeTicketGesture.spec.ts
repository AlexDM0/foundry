/**
 * The make-a-ticket gesture. What matters:
 * each phase of the 3.2-second cycle (fade in, three lines, stamp raised, fall, seal, jolt, lift, filing) and that the cycle repeats; the
 * seal is on the paper and the stamp lands on it; from the seal on the stamp's y is exact, not eased; the pen shrinks away before the stamp
 * appears; and facing left Flint still writes from left to right on the screen.
 */
import { describe, expect, test } from 'bun:test';

import { poseWithPart }        from '../../PoseComposition.ts';
import { easedPoseOf }         from '../../PoseEasing.ts';
import type { Facing, Point }  from '../../SpriteGeometry.ts';
import type { Pose }           from '../../SpritePose.ts';
import { NEUTRAL_POSE }        from '../../SpritePose.ts';
import { PAPER_SHAPE }         from '../../props/shapes/constants/SharedShapes.ts';
import { AnimationCurveUtil }  from '../../utils/AnimationCurveUtil.ts';
import type { GestureInput }   from '../GestureDefinition.ts';
import { MAKE_TICKET_GESTURE } from './MakeTicketGesture.ts';
import { TICKET_SHAPE }        from './constants/MakeTicketValues.ts';

const FRAME_MILLISECONDS = 16;

function inputAt(elapsedMilliseconds: number, facing: Facing = 1): GestureInput<'normal'> {
  return {
    elapsedMilliseconds, variant: 'normal', facing, sidewaysWidth: 1, target: null, verdict: null,
  };
}

function targetAt(elapsedMilliseconds: number, facing: Facing = 1): Pose {
  return poseWithPart(NEUTRAL_POSE, MAKE_TICKET_GESTURE.targetPose(inputAt(elapsedMilliseconds, facing)));
}

/** The drawn pose after easing frame by frame from the neutral pose through the gesture, up to this time. */
function drawnAt(endMilliseconds: number, facing: Facing = 1): Pose {
  let drawn = NEUTRAL_POSE;
  for (let elapsed = 0; elapsed <= endMilliseconds; elapsed += FRAME_MILLISECONDS) drawn = easedPoseOf(drawn, targetAt(elapsed, facing), FRAME_MILLISECONDS);
  return drawn;
}

function paperCorners(): readonly Point[] {
  return PAPER_SHAPE.POINTS;
}

/** Inside a convex polygon whose corners go clockwise on the screen (y down). */
function isInsidePaper(point: Point): boolean {
  const corners = paperCorners();
  return corners.every((corner, i) => {
    const next = corners[(i + 1) % corners.length] ?? corner;
    return ((next.x - corner.x) * (point.y - corner.y)) - ((next.y - corner.y) * (point.x - corner.x)) >= 0;
  });
}

describe('the cycle', () => {
  test('0 to 0.3 s: the blank ticket fades in, while the pen waits at the start of the first line', () => {
    const part = MAKE_TICKET_GESTURE.targetPose(inputAt(150));
    expect(part.props?.ticket).toMatchObject({
      shown: 1, cycleOpacity: 0.5, writtenLengths: [0, 0, 0], sealShown: false, offsetX: 0, offsetY: 0,
    });
    expect(part.nearHand).toMatchObject({ cornerCount: 3, centreX: 34 });
    expect(part.farHand).toBeNull();
  });

  test('0.3 to 1.8 s: Flint writes the three lines, 0.5 s each, up to 12 long, and looks down at each', () => {
    expect(MAKE_TICKET_GESTURE.targetPose(inputAt(550)).props?.ticket?.writtenLengths).toEqual([6, 0, 0]);
    const second = MAKE_TICKET_GESTURE.targetPose(inputAt(1050));
    expect(second.props?.ticket?.writtenLengths).toEqual([12, 6, 0]);
    expect(second.eyes).toMatchObject({ height: 6, lift: 0, shift: 6 });
    expect(second.body).toEqual({ leanDegrees: 5 });
    expect(MAKE_TICKET_GESTURE.targetPose(inputAt(1799)).props?.ticket?.writtenLengths[2]).toBeCloseTo(12 - (12 / 500), 5);
  });

  test('1.8 to 2 s: the hand is the stamp, a square of radius 6 turned 45 degrees, raised at (43, -52), and the eyes open to 9', () => {
    const part = MAKE_TICKET_GESTURE.targetPose(inputAt(1900));
    expect(part.nearHand).toEqual({
      cornerCount: 4, centreX: 43, centreY: -52, radius: 6, turnDegrees: 45, placement: 'eased',
    });
    expect(part.eyes?.height).toBe(9);
    expect(part.props?.ticket?.writtenLengths).toEqual([12, 12, 12]);
  });

  test('2 to 2.12 s: the stamp falls towards the seal', () => {
    expect(MAKE_TICKET_GESTURE.targetPose(inputAt(2060)).nearHand?.centreY).toBeCloseTo(-52 + (37 / 2));
  });

  test('at 2.12 s the seal shows, the stamp is on it and the happy eyes show; the ticket is 1.5 lower until 2.25 s', () => {
    const part = MAKE_TICKET_GESTURE.targetPose(inputAt(2120));
    expect(part.props?.ticket).toMatchObject({ sealShown: true, offsetY: 1.5 });
    expect(part.nearHand).toMatchObject({ centreX: 43, centreY: -15 });
    expect(part.eyes?.happiness).toBe(1);
    expect(MAKE_TICKET_GESTURE.targetPose(inputAt(2250)).props?.ticket?.offsetY).toBe(0);
  });

  test('2.25 to 2.4 s: the stamp lifts 10 units, then waits', () => {
    expect(MAKE_TICKET_GESTURE.targetPose(inputAt(2325)).nearHand?.centreY).toBeCloseTo(-20);
    expect(MAKE_TICKET_GESTURE.targetPose(inputAt(2450)).nearHand?.centreY).toBe(-25);
  });

  test('2.5 to 3.2 s: the hand goes away and the ticket moves by (14, -6) as it fades out, still happy', () => {
    const part = MAKE_TICKET_GESTURE.targetPose(inputAt(2850));
    expect(part.nearHand).toBeNull();
    expect(part.props?.ticket).toMatchObject({
      cycleOpacity: 0.5, offsetX: 7, offsetY: -3, sealShown: true
    });
    expect(part.eyes?.happiness).toBe(1);
  });

  test('the cycle repeats every 3.2 s', () => {
    expect(MAKE_TICKET_GESTURE.targetPose(inputAt(3200 + 550)).props).toEqual(MAKE_TICKET_GESTURE.targetPose(inputAt(550)).props);
  });

  test('the happy eyes of the seal fade in at the eye rate, not at once', () => {
    const eased = easedPoseOf(targetAt(2100), targetAt(2120), FRAME_MILLISECONDS);
    expect(eased.eyes.happiness).toBeCloseTo(AnimationCurveUtil.easingFractionOf(22, FRAME_MILLISECONDS));
  });
});

describe('the seal and the stamp', () => {
  test('the seal is on the paper, below the text', () => {
    const halfDiagonal = (TICKET_SHAPE.SEAL_SIDE_UNITS / 2) * Math.SQRT2;
    const centre = { x: TICKET_SHAPE.SEAL_CENTRE_X_UNITS, y: TICKET_SHAPE.SEAL_CENTRE_Y_UNITS };
    const sealCorners = [
      { x: centre.x, y: centre.y - halfDiagonal },
      { x: centre.x + halfDiagonal, y: centre.y },
      { x: centre.x, y: centre.y + halfDiagonal },
      { x: centre.x - halfDiagonal, y: centre.y },
    ];
    expect(sealCorners.every(isInsidePaper)).toBe(true);
    expect(centre.y - halfDiagonal).toBeGreaterThan(Math.max(...TICKET_SHAPE.LINE_Y_UNITS) + (TICKET_SHAPE.FULL_LINE_UNITS * 0.2));
  });

  test('from the seal on, the stamp\'s y is set exactly on each frame, not eased', () => {
    const fallingDrawn = drawnAt(2110);
    expect(fallingDrawn.nearHand?.centreY).not.toBeCloseTo(-15);
    const sealed = easedPoseOf(fallingDrawn, targetAt(2120), FRAME_MILLISECONDS);
    expect(sealed.nearHand?.centreY).toBe(-15);
    const lifting = easedPoseOf(sealed, targetAt(2325), FRAME_MILLISECONDS);
    expect(lifting.nearHand?.centreY).toBeCloseTo(-20);
  });

  test('the pen shrinks away in its own shape before the stamp appears from the body', () => {
    let drawn = drawnAt(1790);
    expect(drawn.nearHand?.cornerCount).toBe(3);
    const shapesSeen: number[] = [];
    for (let elapsed = 1800; elapsed < 2000; elapsed += FRAME_MILLISECONDS) {
      const radiusBefore = drawn.nearHand?.radius ?? 0;
      drawn = easedPoseOf(drawn, targetAt(elapsed), FRAME_MILLISECONDS);
      if (drawn.nearHand?.cornerCount === 3) expect(drawn.nearHand.radius).toBeLessThan(radiusBefore);
      shapesSeen.push(drawn.nearHand?.cornerCount ?? 0);
    }
    const firstSquare = shapesSeen.indexOf(4);
    expect(firstSquare).toBeGreaterThan(0);
    expect(shapesSeen.slice(firstSquare).every((cornerCount) => cornerCount === 4)).toBe(true);
  });
});

describe('facing left', () => {
  test('Flint still writes from left to right on the screen, the pen right of the line\'s end, turned 35 degrees', () => {
    const early = MAKE_TICKET_GESTURE.targetPose(inputAt(400, -1)).nearHand;
    const later = MAKE_TICKET_GESTURE.targetPose(inputAt(700, -1)).nearHand;
    expect(-(later?.centreX ?? 0)).toBeGreaterThan(-(early?.centreX ?? 0));
    expect(later?.turnDegrees).toBe(35);
    expect(later?.centreX).toBeCloseTo(31 + 12 - 9.6 - 3);
  });

  test('the stamp, the seal and the filing are the same as facing right: the flip mirrors them with the paper', () => {
    for (const moment of [1900, 2120, 2850]) {
      const left = MAKE_TICKET_GESTURE.targetPose(inputAt(moment, -1));
      const right = MAKE_TICKET_GESTURE.targetPose(inputAt(moment, 1));
      expect(left.nearHand).toEqual(right.nearHand);
      expect(left.props?.ticket).toEqual(right.props?.ticket);
    }
  });
});

test('reduced motion holds the sealed ticket, with the stamp lifted and the happy eyes', () => {
  const part = MAKE_TICKET_GESTURE.targetPose(inputAt(MAKE_TICKET_GESTURE.intents['make-ticket'].stillMomentMilliseconds));
  expect(part.props?.ticket).toMatchObject({ sealShown: true, writtenLengths: [12, 12, 12], offsetX: 0 });
  expect(part.nearHand?.centreY).toBe(-25);
  expect(part.eyes?.happiness).toBe(1);
});
