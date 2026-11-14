/**
 * What the emotes of `02-animations.md`, "Emotes", share: the mark's exit, the entrance spring, the entrances of the sweat drop and the
 * thinking dots, the flight of the sweat beads, and the hop. A gesture that shows one of these marks reaches them through
 * `flint/gestures/GestureMarkUtil.ts`.
 */
import type { EmoteMarkPoseOf } from '../SpritePose.ts';
import { emoteMarkAtRest }      from '../SpritePose.ts';
import { SPRING }               from '../constants/Motion.ts';
import type { MarkName }        from '../marks/MarkCatalog.ts';
import type { SweatBeadPose }   from '../marks/sweat-beads/SweatBeadsMark.ts';
import { THINKING_DOTS_SHAPE }  from '../marks/thinking-dots/constants/ThinkingDotsValues.ts';
import { AnimationCurveUtil }   from '../utils/AnimationCurveUtil.ts';
import type { EmoteInput }      from './EmoteDefinition.ts';
import {
  EMOTE_HOP,
  MARK_EXIT,
  SWEAT_BEADS_FLIGHT,
  SWEAT_DROP_ENTRANCE,
  THINKING_DOTS_ENTRANCE
} from './constants/EmoteMotion.ts';

/** Dot n shows once the age is past the first dot's moment plus n intervals, both times `entranceScale`. */
function thinkingDotsShownAt(ageMilliseconds: number, entranceScale: number): number {
  const sinceFirstDot = ageMilliseconds - (THINKING_DOTS_ENTRANCE.FIRST_DOT_MILLISECONDS * entranceScale);
  if (sinceFirstDot <= 0) return 0;
  return Math.min(THINKING_DOTS_SHAPE.X_UNITS.length, Math.ceil(sinceFirstDot / (THINKING_DOTS_ENTRANCE.DOT_INTERVAL_MILLISECONDS * entranceScale)));
}

export const EmoteMarkUtil = Object.freeze({
  /**
   * The mark at its anchor; in the last moment of the emote it fades out and shrinks to its smallest scale. Under reduced motion it only
   * fades.
   */
  leavingMarkOf: <Name extends MarkName>(name: Name, input: EmoteInput, durationMilliseconds: number): EmoteMarkPoseOf<Name> => {
    const mark = emoteMarkAtRest(name);
    const remaining = AnimationCurveUtil.clamp((durationMilliseconds - input.ageMilliseconds) / MARK_EXIT.FADE_MILLISECONDS);
    const scaleFactor = input.reducedMotion ? 1 : MARK_EXIT.SMALLEST_SCALE_FACTOR + ((1 - MARK_EXIT.SMALLEST_SCALE_FACTOR) * remaining);
    return { ...mark, opacity: remaining, scale: mark.scale * scaleFactor };
  },

  /** The spring of the entrance; under reduced motion the mark shows at once at its full size. */
  entranceSpringOf: (input: EmoteInput): number => (input.reducedMotion ? 1 : AnimationCurveUtil.springScaleAt(input.ageMilliseconds / SPRING.DURATION_MILLISECONDS)),

  /** A mark that springs in on its width and leaves as every mark leaves: the "?", the "!" and the happy glints. */
  springingMarkOf: <Name extends MarkName>(name: Name, input: EmoteInput, durationMilliseconds: number): EmoteMarkPoseOf<Name> => ({
    ...EmoteMarkUtil.leavingMarkOf(name, input, durationMilliseconds),
    innerScaleX: EmoteMarkUtil.entranceSpringOf(input),
  }),

  /** The sweat drop grows in at once, with no spring, and slides down; under reduced motion it holds still at its anchor. */
  sweatDropOf: (input: EmoteInput, durationMilliseconds: number): EmoteMarkPoseOf<'sweat-drop'> => {
    const mark = EmoteMarkUtil.leavingMarkOf('sweat-drop', input, durationMilliseconds);
    const fallen = input.reducedMotion ? 0 : AnimationCurveUtil.clamp(input.ageMilliseconds / SWEAT_DROP_ENTRANCE.FALL_MILLISECONDS);
    const grown = input.reducedMotion ? 1 : AnimationCurveUtil.clamp(input.ageMilliseconds / SWEAT_DROP_ENTRANCE.GROWTH_MILLISECONDS);
    const innerScale = SWEAT_DROP_ENTRANCE.START_SCALE_FACTOR + ((1 - SWEAT_DROP_ENTRANCE.START_SCALE_FACTOR) * grown);
    return {
      ...mark, anchorY: mark.anchorY + (SWEAT_DROP_ENTRANCE.FALL_UNITS * fallen), innerScaleX: innerScale, innerScaleY: innerScale,
    };
  },

  /** The thinking dots show one after the other, with no spring. */
  thinkingDotsOf: (input: EmoteInput, durationMilliseconds: number, entranceScale = 1): EmoteMarkPoseOf<'thinking-dots'> => ({
    ...EmoteMarkUtil.leavingMarkOf('thinking-dots', input, durationMilliseconds),
    details: { dotsShown: thinkingDotsShownAt(input.ageMilliseconds, entranceScale) },
  }),

  /** The sweat beads fly off one after another; under reduced motion they hold still at one point of their flight. */
  sweatBeadsFlightOf: (input: EmoteInput): readonly SweatBeadPose[] => SWEAT_BEADS_FLIGHT.SIDES.map((side, i) => {
    const beadMilliseconds = input.ageMilliseconds - (i * SWEAT_BEADS_FLIGHT.START_INTERVAL_MILLISECONDS);
    const hasStarted = beadMilliseconds > 0;
    const runningFlight = hasStarted ? AnimationCurveUtil.cycleProgressOf(beadMilliseconds, SWEAT_BEADS_FLIGHT.CYCLE_MILLISECONDS) : 0;
    const flight = input.reducedMotion ? SWEAT_BEADS_FLIGHT.STILL_FLIGHT : runningFlight;
    return {
      x:           side * (SWEAT_BEADS_FLIGHT.START_X_UNITS + (SWEAT_BEADS_FLIGHT.SPREAD_X_UNITS * flight)),
      y:           SWEAT_BEADS_FLIGHT.START_Y_UNITS - (SWEAT_BEADS_FLIGHT.RISE_UNITS * flight) + (SWEAT_BEADS_FLIGHT.FALL_UNITS * flight * flight),
      turnDegrees: side * SWEAT_BEADS_FLIGHT.TURN_DEGREES,
      opacity:     hasStarted ? 1 - flight : 0,
    };
  }),

  /** The sweat beads flying off, leaving as every mark leaves. */
  sweatBeadsOf: (input: EmoteInput, durationMilliseconds: number): EmoteMarkPoseOf<'sweat-beads'> => ({
    ...EmoteMarkUtil.leavingMarkOf('sweat-beads', input, durationMilliseconds),
    details: { beads: EmoteMarkUtil.sweatBeadsFlightOf(input) },
  }),

  /** The one hop of Surprised and Idea; none under reduced motion. */
  hopLiftOf: (input: EmoteInput): number => {
    if (input.reducedMotion || input.ageMilliseconds >= EMOTE_HOP.MILLISECONDS) return 0;
    return EMOTE_HOP.HEIGHT_UNITS * Math.sin((Math.PI * input.ageMilliseconds) / EMOTE_HOP.MILLISECONDS);
  },
});
