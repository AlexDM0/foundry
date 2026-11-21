/** The behaviour's base pose from the motion of `02-animations.md`: where Flint stands, its hover, its walk wobble, its jump and blink. */
import { poseWithPart }       from './PoseComposition.ts';
import type { Facing }        from './SpriteGeometry.ts';
import type { Pose }          from './SpritePose.ts';
import { NEUTRAL_POSE }       from './SpritePose.ts';
import { BLINK }              from './constants/Motion.ts';
import { IdleMotionUtil }     from './utils/IdleMotionUtil.ts';
import type { JumpState }     from './utils/JumpMotionUtil.ts';
import { JumpMotionUtil }     from './utils/JumpMotionUtil.ts';
import type { WalkDirection } from './utils/WalkMotionUtil.ts';
import { WalkMotionUtil }     from './utils/WalkMotionUtil.ts';

export interface MotionState {
  /** Overlay units. */
  readonly positionX:     number;
  readonly floorY:        number;
  readonly facing:        Facing;
  readonly walkDirection: WalkDirection;
  readonly jump:          JumpState;
}

export interface MotionPoseOptions {
  /** Only while Flint does nothing else: no gesture, no emote, not asleep. */
  readonly blinkIsAllowed: boolean;
}

/** The landing squash wins over the air stretch, which wins over the walk wobble; a blink shuts the eyes at once. */
export function motionBasePose(motion: MotionState, elapsedMilliseconds: number, options: MotionPoseOptions): Pose {
  const placed: Pose = {
    ...NEUTRAL_POSE,
    body: {
      ...NEUTRAL_POSE.body,
      positionX:  motion.positionX,
      floorY:     motion.floorY,
      facing:     motion.facing,
      jumpHeight: motion.jump.height,
      hover:      IdleMotionUtil.hoverHeightAt(elapsedMilliseconds),
    },
  };
  const jumpPart = JumpMotionUtil.bodyPartOf(motion.jump);
  const walking = jumpPart === null && motion.walkDirection !== 0;
  const moved = walking ? poseWithPart(placed, { body: { heightFactor: WalkMotionUtil.wobbleHeightFactorAt(elapsedMilliseconds) } }) : poseWithPart(placed, jumpPart);
  const blinking = options.blinkIsAllowed && IdleMotionUtil.blinkIsClosedAt(elapsedMilliseconds);
  return blinking ? poseWithPart(moved, { eyes: { height: BLINK.CLOSED_HEIGHT_UNITS }, exactFields: ['eye-height'] }) : moved;
}
