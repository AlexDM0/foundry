/**
 * The one easing step: each value eases exponentially at its own rate, a changing hand shrinks before it reappears, a held hand sits on its
 * prop's grip, exact fields snap, and parts that go (props, attendant members, page shapes) fade out before they are gone.
 */
import { describe, expect, test } from 'bun:test';

import { easedPoseOf }                   from './PoseEasing.ts';
import type { HandPose, PagePose, Pose } from './SpritePose.ts';
import { EMPTY_PAGE, NEUTRAL_POSE }      from './SpritePose.ts';
import { AnimationCurveUtil }            from './utils/AnimationCurveUtil.ts';

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
    expect(AnimationCurveUtil.easingFractionOf(7, 100)).toBeCloseTo(1 - Math.exp(-0.7));
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
    const fraction = AnimationCurveUtil.easingFractionOf(18, FRAME_MILLISECONDS);
    expect(eased.nearHand).toMatchObject({ cornerCount: 3, radius: 7 * fraction });
    expect(eased.nearHand?.centreX).toBeCloseTo(10 + (19 * fraction));
    expect(eased.nearHand?.centreY).toBeCloseTo(-22 - (3 * fraction));
  });

  test('a hand that changes its shape first shrinks in its old shape, at twice the hand step', () => {
    const eased = easedPoseOf(withNearHand(TRIANGLE), withNearHand(HEXAGON), FRAME_MILLISECONDS);
    expect(eased.nearHand).toMatchObject({ cornerCount: 3, centreX: 29, centreY: -25 });
    expect(eased.nearHand?.radius).toBeCloseTo(7 * (1 - Math.min(1, 2 * AnimationCurveUtil.easingFractionOf(18, FRAME_MILLISECONDS))));
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

  test('a hand held to a prop sits on that prop\'s drawn grip point on every frame: the looking glass at (-8, +8) from the lens', () => {
    const glassHand: HandPose = {
      cornerCount: 5, centreX: 0, centreY: 0, radius: 5, turnDegrees: 0, placement: { heldTo: 'lookingGlass' },
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
    expect(eased.props.keyboard.shown).toBeCloseTo(AnimationCurveUtil.easingFractionOf(18, FRAME_MILLISECONDS));
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

describe('the new channels of the body', () => {
  const withBody = (body: Partial<Pose['body']>): Pose => ({ ...NEUTRAL_POSE, body: { ...NEUTRAL_POSE.body, ...body } });

  test('the tint amount and the fill opacity ease at the eye rate', () => {
    const eased = easedPoseOf(NEUTRAL_POSE, withBody({ tint: { role: 'alarm', amount: 1 }, fillOpacity: 0 }), FRAME_MILLISECONDS);
    expect(eased.body.tint.amount).toBeCloseTo(AnimationCurveUtil.easingFractionOf(22, FRAME_MILLISECONDS));
    expect(eased.body.tint.role).toBe('alarm');
    expect(eased.body.fillOpacity).toBeCloseTo(1 - AnimationCurveUtil.easingFractionOf(22, FRAME_MILLISECONDS));
  });

  test('a tint with its own rate eases at that rate, and a fading tint keeps its colour', () => {
    const slow = easedPoseOf(NEUTRAL_POSE, withBody({ tint: { role: 'emberDark', amount: 0.85, ratePerSecond: 2.2 } }), FRAME_MILLISECONDS);
    expect(slow.body.tint.amount).toBeCloseTo(0.85 * AnimationCurveUtil.easingFractionOf(2.2, FRAME_MILLISECONDS));
    const fading = easedPoseOf(withBody({ tint: { role: 'alarm', amount: 1 } }), NEUTRAL_POSE, FRAME_MILLISECONDS);
    expect([fading.body.tint.role, fading.body.tint.amount < 1]).toEqual(['alarm', true]);
  });

  test('an exact tint and fill are set on this frame', () => {
    const exact = easedPoseOf(NEUTRAL_POSE, { ...withBody({ tint: { role: 'alarm', amount: 1 }, fillOpacity: 0.55 }), exactFields: ['tint', 'fill-opacity'] }, FRAME_MILLISECONDS);
    expect([exact.body.tint.amount, exact.body.fillOpacity]).toEqual([1, 0.55]);
  });

  test('a glow the gesture part no longer gives eases back to 0 at the eye rate, and keeps the target\'s embers', () => {
    const glowing: Pose = { ...NEUTRAL_POSE, sleep: { glowOpacity: 0.6, embers: [] } };
    const firstFrame = easedPoseOf(glowing, NEUTRAL_POSE, FRAME_MILLISECONDS);
    expect(firstFrame.sleep.glowOpacity).toBeCloseTo(0.6 * (1 - AnimationCurveUtil.easingFractionOf(22, FRAME_MILLISECONDS)));
    let drawn = firstFrame;
    for (let i = 0; i < 30; i++) drawn = easedPoseOf(drawn, NEUTRAL_POSE, FRAME_MILLISECONDS);
    expect(drawn.sleep.glowOpacity).toBeLessThan(0.001);
    expect(drawn.sleep.embers).toBe(NEUTRAL_POSE.sleep.embers);
  });

  test('an exact inner glow, as sleep gives, is set on this frame', () => {
    const exact = easedPoseOf(NEUTRAL_POSE, { ...NEUTRAL_POSE, sleep: { glowOpacity: 0.4, embers: [] }, exactFields: ['inner-glow'] }, FRAME_MILLISECONDS);
    expect(exact.sleep.glowOpacity).toBe(0.4);
  });
});

describe('attendants', () => {
  const SPARK = {
    name: 'watcher-spark', index: 0, x: -26, y: -44, turnDegrees: 45, scale: 1,
  } as const;

  test('a member the target has is drawn as the target places it', () => {
    expect(easedPoseOf(NEUTRAL_POSE, { ...NEUTRAL_POSE, attendants: [SPARK] }, FRAME_MILLISECONDS).attendants).toEqual([SPARK]);
  });

  test('a member the target lost shrinks away at the hand rate, and is gone once it is too small to see', () => {
    let drawn: Pose = { ...NEUTRAL_POSE, attendants: [SPARK] };
    drawn = easedPoseOf(drawn, NEUTRAL_POSE, FRAME_MILLISECONDS);
    expect(drawn.attendants[0]?.scale).toBeCloseTo(1 - AnimationCurveUtil.easingFractionOf(18, FRAME_MILLISECONDS));
    for (let i = 0; i < 40; i++) drawn = easedPoseOf(drawn, NEUTRAL_POSE, FRAME_MILLISECONDS);
    expect(drawn.attendants).toEqual([]);
  });
});

describe('the page shapes of a behaviour', () => {
  const PAGE: PagePose = {
    shapes: [{
      kind: 'circle', key: 'bug', centreX: 300, centreY: 600, radius: 3, fill: 'alarm',
    }],
    opacity:             1,
    fadeOutMilliseconds: 200,
  };

  test('the shapes a behaviour gives are drawn as given, never eased', () => {
    const moved: PagePose = { ...PAGE, shapes: [{ ...PAGE.shapes[0], centreX: 500 } as PagePose['shapes'][number]] };
    expect(easedPoseOf({ ...NEUTRAL_POSE, page: PAGE }, { ...NEUTRAL_POSE, page: moved }, FRAME_MILLISECONDS).page).toEqual(moved);
  });

  test('once the behaviour gives none, the last shapes fade out over its fade time, and then are gone', () => {
    let drawn: Pose = easedPoseOf(NEUTRAL_POSE, { ...NEUTRAL_POSE, page: PAGE }, FRAME_MILLISECONDS);
    drawn = easedPoseOf(drawn, NEUTRAL_POSE, 100);
    expect([drawn.page.shapes, drawn.page.opacity]).toEqual([PAGE.shapes, 0.5]);
    drawn = easedPoseOf(drawn, NEUTRAL_POSE, 100);
    expect(drawn.page).toEqual(EMPTY_PAGE);
  });
});
