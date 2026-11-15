/**
 * A mark a gesture shows during one step of its timeline (`06-more-animations.md`, "New channels of the pose"): the mark enters as its emote
 * brings it in and leaves in the last 160 ms of the step, as an emote's mark leaves. Outside the step there is no mark.
 */
import type { EmoteMarkPoseOf }              from '../SpritePose.ts';
import type { EmoteInput }                   from '../emotes/EmoteDefinition.ts';
import { EmoteMarkUtil }                     from '../emotes/EmoteMarkUtil.ts';
import { MARK_EXIT, THINKING_DOTS_ENTRANCE } from '../emotes/constants/EmoteMotion.ts';
import type { MarkName }                     from '../marks/MarkCatalog.ts';
import { THINKING_DOTS_SHAPE }               from '../marks/thinking-dots/constants/ThinkingDotsValues.ts';

/** The step of the gesture's timeline that shows the mark, from its start up to its end. */
export interface MarkStep {
  readonly startMilliseconds: number;
  readonly endMilliseconds:   number;
}

/** The time in the step as an emote's age. The gesture's time is already held at the still moment under reduced motion. */
function stepInputOf(elapsedMilliseconds: number, step: MarkStep): EmoteInput | null {
  if (elapsedMilliseconds < step.startMilliseconds || elapsedMilliseconds >= step.endMilliseconds) return null;
  return { ageMilliseconds: elapsedMilliseconds - step.startMilliseconds, facing: 1, reducedMotion: false };
}

function lengthOf(step: MarkStep): number {
  return step.endMilliseconds - step.startMilliseconds;
}

/** 1 when the step holds the whole entrance of the dots; below 1 the entrance runs faster, so the last dot shows whole before the exit. */
function thinkingDotsEntranceScaleOf(stepMilliseconds: number): number {
  const lastDotMilliseconds = THINKING_DOTS_ENTRANCE.FIRST_DOT_MILLISECONDS + (THINKING_DOTS_ENTRANCE.DOT_INTERVAL_MILLISECONDS * (THINKING_DOTS_SHAPE.X_UNITS.length - 1));
  const lastDotLatestMilliseconds = stepMilliseconds - MARK_EXIT.FADE_MILLISECONDS - THINKING_DOTS_ENTRANCE.LAST_DOT_WHOLE_MILLISECONDS;
  return Math.min(1, Math.max(0, lastDotLatestMilliseconds) / lastDotMilliseconds);
}

export const GestureMarkUtil = Object.freeze({
  /** The "?", the "!" or the happy glints: a spring on the width at the start of the step. */
  springingMarkIn: <Name extends MarkName>(name: Name, elapsedMilliseconds: number, step: MarkStep): EmoteMarkPoseOf<Name> | null => {
    const input = stepInputOf(elapsedMilliseconds, step);
    return input === null ? null : EmoteMarkUtil.springingMarkOf(name, input, lengthOf(step));
  },

  /** The sweat beads of the Nervous emote, flying off one after another. */
  sweatBeadsIn: (elapsedMilliseconds: number, step: MarkStep): EmoteMarkPoseOf<'sweat-beads'> | null => {
    const input = stepInputOf(elapsedMilliseconds, step);
    return input === null ? null : EmoteMarkUtil.sweatBeadsOf(input, lengthOf(step));
  },

  /** The sweat drop of the Sweatdrop emote: it grows in at once and slides down. */
  sweatDropIn: (elapsedMilliseconds: number, step: MarkStep): EmoteMarkPoseOf<'sweat-drop'> | null => {
    const input = stepInputOf(elapsedMilliseconds, step);
    return input === null ? null : EmoteMarkUtil.sweatDropOf(input, lengthOf(step));
  },

  /** The dots of the Thinking emote, one after the other; in a short step they follow each other faster, so all of them show whole. */
  thinkingDotsIn: (elapsedMilliseconds: number, step: MarkStep): EmoteMarkPoseOf<'thinking-dots'> | null => {
    const input = stepInputOf(elapsedMilliseconds, step);
    return input === null ? null : EmoteMarkUtil.thinkingDotsOf(input, lengthOf(step), thinkingDotsEntranceScaleOf(lengthOf(step)));
  },
});
