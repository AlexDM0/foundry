/**
 * The one easing step against `02-animations.md`, "Rules for all animations". What matters: easing is exponential at the rate of each
 * value; a hand that changes shape shrinks first at twice the hand step and only then appears from the body in its new shape; the hand of
 * the looking glass sits at a fixed offset from the drawn lens on every frame; a prop fades and keeps its last look while it goes; an
 * exact field snaps, as a blink does.
 */
import { describe, expect, test } from 'bun:test';

import { easedPoseOf, easingFractionOf } from './PoseEasing.ts';
import type { HandPose, Pose }           from './SpritePose.ts';
import { NEUTRAL_POSE }                  from './SpritePose.ts';

const FRAME_MILLISECONDS = 16;

const TRIANGLE: HandPose = {
  cornerCount: 3, centreX: 29, centreY: -25, radius: 7, turnDegrees: 90, placement: 'eased',
};
const HEXAGON: HandPose = {
  cornerCount: 6, centreX: 31, centreY: -24, radius: 8, turnDegrees: 0, placement: 'eased',
};

function withNearHand(hand: HandPose | null): Pose {
  return { ...NEUTRAL_POSE, nearHand: hand };
}

describe('exponential easing', () => {
  test('one step covers 1 - exp(-rate × seconds) of the distance', () => {
    expect(easingFractionOf(7, 100)).toBeCloseTo(1 - Math.exp(-0.7));
  });

  test('the lean moves at the body rate and the eye height at the eye rate', () => {
    const target: Pose = { ...NEUTRAL_POSE, body: { ...NEUTRAL_POSE.body, leanDegrees: 10 }, eyes: { ...NEUTRAL_POSE.eyes, height: 4 } };
    const eased = easedPoseOf(NEUTRAL_POSE, target, 100);
    expect(eased.body.leanDegrees).toBeCloseTo(10 * (1 - Math.exp(-0.7)));
    expect(eased.eyes.height).toBeCloseTo(8 - (4 * (1 - Math.exp(-2.2))));
  });

  test('the position is set at once, except during a peek, when it eases at the body rate', () => {
    const walking: Pose = { ...NEUTRAL_POSE, body: { ...NEUTRAL_POSE.body, positionX: 50 } };
    expect(easedPoseOf(NEUTRAL_POSE, walking, 100).body.positionX).toBe(50);
    const peeking: Pose = { ...walking, body: { ...walking.body, positionEasing: 'peek' } };
    expect(easedPoseOf(NEUTRAL_POSE, peeking, 100).body.positionX).toBeCloseTo(50 * (1 - Math.exp(-0.7)));
  });

  test('a blink\'s exact eye height snaps the eyes shut at once', () => {
    const blink: Pose = { ...NEUTRAL_POSE, eyes: { ...NEUTRAL_POSE.eyes, height: 1 }, exactFields: ['eye-height'] };
    const eased = easedPoseOf(NEUTRAL_POSE, blink, FRAME_MILLISECONDS);
    expect(eased.eyes.height).toBe(1);
    expect(eased.eyes.rightHeightOverride).toBe(1);
  });

  test('the right eye follows the height until an override parts it', () => {
    const doubt: Pose = { ...NEUTRAL_POSE, eyes: { ...NEUTRAL_POSE.eyes, rightHeightOverride: 5 } };
    const eased = easedPoseOf(NEUTRAL_POSE, doubt, 1000);
    expect(eased.eyes.height).toBeCloseTo(8);
    expect(eased.eyes.rightHeightOverride).toBeCloseTo(5);
  });
});

describe('hands', () => {
  test('a new hand appears from the body at (10, -22) and grows to its place', () => {
    const eased = easedPoseOf(NEUTRAL_POSE, withNearHand(TRIANGLE), FRAME_MILLISECONDS);
    const fraction = easingFractionOf(18, FRAME_MILLISECONDS);
    expect(eased.nearHand).toMatchObject({ cornerCount: 3, radius: 7 * fraction });
    expect(eased.nearHand?.centreX).toBeCloseTo(10 + (19 * fraction));
    expect(eased.nearHand?.centreY).toBeCloseTo(-22 - (3 * fraction));
  });

  test('a hand that changes its shape first shrinks in its old shape, at twice the hand step', () => {
    const eased = easedPoseOf(withNearHand(TRIANGLE), withNearHand(HEXAGON), FRAME_MILLISECONDS);
    expect(eased.nearHand).toMatchObject({ cornerCount: 3, centreX: 29, centreY: -25 });
    expect(eased.nearHand?.radius).toBeCloseTo(7 * (1 - Math.min(1, 2 * easingFractionOf(18, FRAME_MILLISECONDS))));
  });

  test('once the old hand is gone, the new shape appears from the body', () => {
    let drawn = withNearHand(TRIANGLE);
    const shapesSeen: number[] = [];
    for (let i = 0; i < 40; i++) {
      drawn = easedPoseOf(drawn, withNearHand(HEXAGON), FRAME_MILLISECONDS);
      shapesSeen.push(drawn.nearHand?.cornerCount ?? 0);
    }
    const firstHexagon = shapesSeen.indexOf(6);
    expect(firstHexagon).toBeGreaterThan(0);
    expect(shapesSeen.slice(firstHexagon).every((cornerCount) => cornerCount === 6)).toBe(true);
    expect(drawn.nearHand?.radius).toBeCloseTo(8, 0);
  });

  test('a hand no gesture needs shrinks away in its last shape', () => {
    const eased = easedPoseOf(withNearHand(TRIANGLE), NEUTRAL_POSE, FRAME_MILLISECONDS);
    expect(eased.nearHand).toMatchObject({ cornerCount: 3, centreX: 29 });
    expect(eased.nearHand?.radius).toBeLessThan(7);
  });

  test('the hand of the looking glass sits at (-8, +8) from the drawn lens on every frame', () => {
    const glassHand: HandPose = {
      cornerCount: 5, centreX: 0, centreY: 0, radius: 5, turnDegrees: 0, placement: 'held-to-lens',
    };
    const target: Pose = {
      ...withNearHand(glassHand),
      props: { ...NEUTRAL_POSE.props, lookingGlass: { shown: 1, centreX: 44, centreY: -37 } },
    };
    let drawn: Pose = withNearHand({ ...glassHand, radius: 5 });
    for (let i = 0; i < 5; i++) {
      drawn = easedPoseOf(drawn, target, FRAME_MILLISECONDS);
      expect(drawn.nearHand?.centreX).toBeCloseTo(drawn.props.lookingGlass.centreX - 8);
      expect(drawn.nearHand?.centreY).toBeCloseTo(drawn.props.lookingGlass.centreY + 8);
    }
    expect(drawn.props.lookingGlass.centreX).toBeLessThan(44);
  });

  test('an exact-position hand is placed at once while its radius still eases', () => {
    const stamp: HandPose = {
      cornerCount: 4, centreX: 43, centreY: -15, radius: 6, turnDegrees: 45, placement: 'exact-position',
    };
    const eased = easedPoseOf(withNearHand({ ...stamp, centreY: -52, radius: 3 }), withNearHand(stamp), FRAME_MILLISECONDS);
    expect(eased.nearHand).toMatchObject({ centreX: 43, centreY: -15 });
    expect(eased.nearHand?.radius).toBeLessThan(6);
  });
});

describe('props', () => {
  test('a prop fades in at the hand rate', () => {
    const target: Pose = { ...NEUTRAL_POSE, props: { ...NEUTRAL_POSE.props, keyboard: { shown: 1, drop: 1.6 } } };
    const eased = easedPoseOf(NEUTRAL_POSE, target, FRAME_MILLISECONDS);
    expect(eased.props.keyboard.shown).toBeCloseTo(easingFractionOf(18, FRAME_MILLISECONDS));
    expect(eased.props.keyboard.drop).toBe(1.6);
  });

  test('a prop the target no longer shows keeps its last look while it fades out', () => {
    const drawn: Pose = {
      ...NEUTRAL_POSE,
      props: {
        ...NEUTRAL_POSE.props,
        ticket: {
          shown: 1, cycleOpacity: 1, writtenLengths: [12, 12, 6], sealShown: true, offsetX: 3, offsetY: -1,
        },
      },
    };
    const eased = easedPoseOf(drawn, NEUTRAL_POSE, FRAME_MILLISECONDS);
    expect(eased.props.ticket).toMatchObject({ writtenLengths: [12, 12, 6], sealShown: true, offsetX: 3 });
    expect(eased.props.ticket.shown).toBeLessThan(1);
  });
});
