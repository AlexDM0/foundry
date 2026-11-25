/**
 * The contract of a gesture: a pure function from the time in the gesture,
 * its variant, the facing and the gesture's own input to its part of the target pose. A gesture never eases and never reads a clock; the
 * easing step makes it smooth. Each gesture names its own intents, one for each variant, with the timing of that variant.
 */
import type { DrawnExtent, Facing, Point } from '../SpriteGeometry.ts';
import type { PosePart }                   from '../SpritePose.ts';

export interface GestureInput<Variant extends string = string> {
  /** Since the gesture started; under reduced motion, the variant's still moment. Use it as `t` in a `sin(t / n)`. */
  readonly elapsedMilliseconds: number;
  /** The variant of the intent that started the gesture. */
  readonly variant:             Variant;
  readonly facing:              Facing;
  /** The sideways width of the pose below the gesture: the wave of a peek keeps its distance by dividing by it. */
  readonly sidewaysWidth:       number;
  /** The target the gesture aims at, in sprite units relative to the bottom tip, for Flint facing right; null when there is none. */
  readonly target:              Point | null;
  /** What `verdict.verdictOf` answered at the verdict moment (the grab caught its target); null before that moment. */
  readonly verdict:             boolean | null;
}

/** A decision a gesture takes once, at one moment, which the mind keeps and gives back through `GestureInput.verdict`. */
export interface GestureVerdict<Variant extends string = string> {
  readonly momentMilliseconds: number;
  verdictOf(input: GestureInput<Variant>): boolean;
}

/** What one intent of a gesture runs: its variant, how long it lasts, and the moment reduced motion holds. */
export interface GestureForm<Variant extends string = string> {
  readonly variant:                 Variant;
  /** Null runs until something stops it (a loop or a steady pose); a number ends the gesture after that long (one action). */
  readonly durationMilliseconds:    number | null;
  /** The moment of the gesture that reduced motion holds as its still pose. */
  readonly stillMomentMilliseconds: number;
  /**
   * All that Flint draws while the form plays, its body included, over its whole timeline and its still moment, with no target; in a box
   * that keeps Flint inside, Flint stands where it fits.
   */
  readonly extent:                  DrawnExtent;
}

export interface GestureDefinition<Name extends string = string, Intent extends string = string, Variant extends string = string> {
  readonly name:                  Name;
  /** Each intent that starts this gesture, by its name on the fixed intent list, with the form it runs. */
  readonly intents:               Readonly<Record<Intent, GestureForm<Variant>>>;
  /** True goes on while Flint walks; every other gesture stops. */
  readonly continuesWhileWalking: boolean;
  /** True goes on while Flint jumps; every other gesture stops. */
  readonly continuesWhileJumping: boolean;
  /** True when `perform(intent, element)` aims the gesture at that element's centre, on each frame. */
  readonly aimsAtElement:         boolean;
  readonly verdict:               GestureVerdict<Variant> | null;
  targetPose(input: GestureInput<Variant>): PosePart;
}

/** Keeps the literal name, intents and variants of a gesture definition, so the catalog can derive the intent list from it. */
export function gestureDefinition<const Name extends string, const Intent extends string, const Variant extends string>(
  definition: GestureDefinition<Name, Intent, Variant>,
): GestureDefinition<Name, Intent, Variant> {
  return Object.freeze(definition);
}

/** The form of a gesture with one intent and no variant: the intent is the gesture's name, and the variant is `normal`. */
export function singleFormOf(durationMilliseconds: number | null, stillMomentMilliseconds: number, extent: DrawnExtent): GestureForm<'normal'> {
  return Object.freeze({
    variant: 'normal', durationMilliseconds, stillMomentMilliseconds, extent,
  });
}
