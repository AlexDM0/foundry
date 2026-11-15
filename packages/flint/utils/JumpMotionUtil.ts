/** The jump of `02-animations.md`: a start speed up, gravity down, a stretch in the air and a squash on landing that eases back. */
import type { PosePart }           from '../SpritePose.ts';
import { MILLISECONDS_PER_SECOND } from '../constants/Easing.ts';
import { JUMP }                    from '../constants/Motion.ts';

export interface JumpState {
  /** Units above the floor. */
  readonly height:                       number;
  /** Units per second; positive is up. */
  readonly upwardSpeed:                  number;
  readonly landingRemainingMilliseconds: number;
}

export const GROUNDED: JumpState = Object.freeze({ height: 0, upwardSpeed: 0, landingRemainingMilliseconds: 0 });

function isAirborne(state: JumpState): boolean {
  return state.height > 0 || state.upwardSpeed > 0;
}

export const JumpMotionUtil = Object.freeze({
  isAirborne,

  /** A jump starts only from the floor; a jump asked for in the air changes nothing. */
  launched: (state: JumpState): JumpState => (isAirborne(state) ? state : { ...state, upwardSpeed: JUMP.START_SPEED_UNITS_PER_SECOND }),

  advanced: (state: JumpState, deltaMilliseconds: number): JumpState => {
    const seconds = deltaMilliseconds / MILLISECONDS_PER_SECOND;
    if (!isAirborne(state)) return { ...state, landingRemainingMilliseconds: Math.max(0, state.landingRemainingMilliseconds - deltaMilliseconds) };
    const height = state.height + (state.upwardSpeed * seconds);
    if (height <= 0) return { height: 0, upwardSpeed: 0, landingRemainingMilliseconds: JUMP.LANDING_MILLISECONDS };
    return { height, upwardSpeed: state.upwardSpeed - (JUMP.GRAVITY_UNITS_PER_SECOND_SQUARED * seconds), landingRemainingMilliseconds: 0 };
  },

  /** The landing squash eases back to normal over its time; in the air the body stretches and the eyes open wide. */
  bodyPartOf: (state: JumpState): PosePart | null => {
    if (state.landingRemainingMilliseconds > 0) {
      const amount = state.landingRemainingMilliseconds / JUMP.LANDING_MILLISECONDS;
      return { body: { widthFactor: 1 + ((JUMP.LANDING_WIDTH_FACTOR - 1) * amount), heightFactor: 1 - ((1 - JUMP.LANDING_HEIGHT_FACTOR) * amount) } };
    }
    if (isAirborne(state)) return { body: { widthFactor: JUMP.AIR_WIDTH_FACTOR, heightFactor: JUMP.AIR_HEIGHT_FACTOR }, eyes: { height: JUMP.AIR_EYE_HEIGHT_UNITS } };
    return null;
  },
});
