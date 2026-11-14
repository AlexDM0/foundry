/** What the emotes of `02-animations.md`, "Emotes", share: the mark's exit, the entrance spring and the hop. */
import type { EmoteMarkName, EmoteMarkPose } from '../SpritePose.ts';
import { emoteMarkAtRest }                   from '../SpritePose.ts';
import { EMOTE_HOP, MARK_EXIT }              from '../constants/EmoteMotion.ts';
import { SPRING }                            from '../constants/Motion.ts';
import { AnimationCurveUtil }                from '../utils/AnimationCurveUtil.ts';
import type { EmoteInput }                   from './EmoteDefinition.ts';

export const EmoteMarkUtil = Object.freeze({
  /**
   * The mark at its anchor; in the last moment of the emote it fades out and shrinks to its smallest scale. Under reduced motion it only
   * fades.
   */
  leavingMarkOf: (name: EmoteMarkName, input: EmoteInput, durationMilliseconds: number): EmoteMarkPose => {
    const mark = emoteMarkAtRest(name);
    const remaining = AnimationCurveUtil.clamp((durationMilliseconds - input.ageMilliseconds) / MARK_EXIT.FADE_MILLISECONDS);
    const scaleFactor = input.reducedMotion ? 1 : MARK_EXIT.SMALLEST_SCALE_FACTOR + ((1 - MARK_EXIT.SMALLEST_SCALE_FACTOR) * remaining);
    return { ...mark, opacity: remaining, scale: mark.scale * scaleFactor };
  },

  /** The spring of the entrance; under reduced motion the mark shows at once at its full size. */
  entranceSpringOf: (input: EmoteInput): number => (input.reducedMotion ? 1 : AnimationCurveUtil.springScaleAt(input.ageMilliseconds / SPRING.DURATION_MILLISECONDS)),

  /** The one hop of Surprised and Idea; none under reduced motion. */
  hopLiftOf: (input: EmoteInput): number => {
    if (input.reducedMotion || input.ageMilliseconds >= EMOTE_HOP.MILLISECONDS) return 0;
    return EMOTE_HOP.HEIGHT_UNITS * Math.sin((Math.PI * input.ageMilliseconds) / EMOTE_HOP.MILLISECONDS);
  },
});
