/**
 * The behaviour's base pose. What matters: Flint stands where the motion says, hovering; the landing squash wins over the air stretch,
 * which wins over the walk wobble; and a blink shuts the eyes at once, only while Flint does nothing else.
 */
import { describe, expect, test } from 'bun:test';

import type { MotionState } from './MotionPose.ts';
import { motionBasePose }   from './MotionPose.ts';
import { GROUNDED }         from './utils/JumpMotionUtil.ts';

const STANDING: MotionState = {
  positionX: 120, floorY: 300, facing: -1, walkDirection: 0, jump: GROUNDED,
};
const NO_BLINK_MOMENT = 2000;

describe('the base pose', () => {
  test('stands where the motion says, facing its way, hovering', () => {
    const pose = motionBasePose(STANDING, 0, { blinkIsAllowed: false });
    expect(pose.body).toMatchObject({
      positionX: 120, floorY: 300, facing: -1, jumpHeight: 0, hover: 6,
    });
  });

  test('a walk wobbles the body height', () => {
    const pose = motionBasePose({ ...STANDING, walkDirection: 1 }, 27.5 * Math.PI, { blinkIsAllowed: false });
    expect(pose.body.heightFactor).toBeCloseTo(1.04);
  });

  test('in the air the stretch replaces the walk wobble, and on landing the squash replaces the stretch', () => {
    const rising = { height: 40, upwardSpeed: 100, landingRemainingMilliseconds: 0 };
    const airborne = motionBasePose({ ...STANDING, walkDirection: 1, jump: rising }, 27.5 * Math.PI, { blinkIsAllowed: false });
    expect(airborne.body).toMatchObject({ jumpHeight: 40, widthFactor: 0.94, heightFactor: 1.07 });
    const landing = motionBasePose({ ...STANDING, walkDirection: 1, jump: { height: 0, upwardSpeed: 0, landingRemainingMilliseconds: 180 } }, 0, { blinkIsAllowed: false });
    expect(landing.body).toMatchObject({ widthFactor: 1.14, heightFactor: 0.82 });
  });
});

describe('the blink', () => {
  test('shuts the eyes at once at a blink moment, when Flint may blink', () => {
    const pose = motionBasePose(STANDING, 0, { blinkIsAllowed: true });
    expect(pose.eyes.height).toBe(1);
    expect(pose.exactFields).toContain('eye-height');
  });

  test('does not show while Flint does something else, or between blink moments', () => {
    expect(motionBasePose(STANDING, 0, { blinkIsAllowed: false }).eyes.height).toBe(8);
    expect(motionBasePose(STANDING, NO_BLINK_MOMENT, { blinkIsAllowed: true }).eyes.height).toBe(8);
  });
});
