/**
 * The contract of a gesture (`02-animations.md`, Gestures): a pure function from the time in the gesture, the mood, the facing and the
 * gesture's own input to its part of the target pose. A gesture never eases and never reads a clock; the easing step makes it smooth.
 */
import type { Facing, Point, PosePart } from '../SpritePose.ts';

export type GestureName = 'point' | 'type' | 'review' | 'research' | 'make-ticket' | 'merge' | 'fasten' | 'grab' | 'wave';

export const GESTURE_NAMES: readonly GestureName[] = Object.freeze(['point', 'type', 'review', 'research', 'make-ticket', 'merge', 'fasten', 'grab', 'wave']);

/** The playground calls the normal mood `calm`. */
export type Mood = 'normal' | 'busy' | 'angry';

export const MOODS: readonly Mood[] = Object.freeze(['normal', 'busy', 'angry']);

export interface GestureInput {
  /** Since the gesture started; under reduced motion, the gesture's still moment. Use it as `t` in the handoff's `sin(t / n)`. */
  readonly elapsedMilliseconds: number;
  /** Always one of the definition's own moods. */
  readonly mood:                Mood;
  readonly facing:              Facing;
  /** The sideways width of the pose below the gesture: the wave of a peek keeps its distance by dividing by it. */
  readonly sidewaysWidth:       number;
  /** The grab's target, in sprite units relative to the bottom tip, for Flint facing right; null when there is none. */
  readonly target:              Point | null;
  /** What `verdict.verdictOf` answered at the verdict moment (the grab caught its target); null before that moment. */
  readonly verdict:             boolean | null;
}

/** A decision a gesture takes once, at one moment, which the mind keeps and gives back through `GestureInput.verdict`. */
export interface GestureVerdict {
  readonly momentMilliseconds: number;
  readonly verdictOf:          (input: GestureInput) => boolean;
}

export interface GestureDefinition {
  readonly name:                    GestureName;
  /** Type and review have three moods; every other gesture has only `normal`. */
  readonly moods:                   readonly Mood[];
  /** Null runs until something stops it; a number ends the gesture after that long (grab, wave). */
  readonly durationMilliseconds:    number | null;
  /** Point and grab go on while Flint walks; every other gesture stops. */
  readonly continuesWhileWalking:   boolean;
  /** Point goes on while Flint jumps; every other gesture stops. */
  readonly continuesWhileJumping:   boolean;
  /** The moment of the gesture that reduced motion holds as its still pose. */
  readonly stillMomentMilliseconds: number;
  readonly verdict:                 GestureVerdict | null;
  readonly targetPose:              (input: GestureInput) => PosePart;
}

/** The part of a stub gesture, which leaves the pose of the layers below unchanged. */
export const NEUTRAL_GESTURE_PART: PosePart = Object.freeze({});
