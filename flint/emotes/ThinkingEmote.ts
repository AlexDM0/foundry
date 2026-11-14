/** Implements `02-animations.md`, "Emotes", the Thinking row: the eyes look up, and the thinking dots of `01-character.md` show one by one. */
import { EMOTE_DURATIONS_MILLISECONDS } from '../constants/EmoteDurations.ts';
import { THINKING_DOTS_SHAPE }          from '../constants/EmoteMarkShapes.ts';
import { THINKING_MOTION }              from '../constants/EmoteMotion.ts';
import type { EmoteDefinition }         from './EmoteDefinition.ts';
import { EmoteMarkUtil }                from './EmoteMarkUtil.ts';

const DURATION_MILLISECONDS = EMOTE_DURATIONS_MILLISECONDS.thinking;

/** Dot n shows once the age is past the first dot's moment plus n intervals. */
function thinkingDotsShownAt(ageMilliseconds: number): number {
  const sinceFirstDot = ageMilliseconds - THINKING_MOTION.FIRST_DOT_MILLISECONDS;
  if (sinceFirstDot <= 0) return 0;
  return Math.min(THINKING_DOTS_SHAPE.X_UNITS.length, Math.ceil(sinceFirstDot / THINKING_MOTION.DOT_INTERVAL_MILLISECONDS));
}

export const THINKING_EMOTE = Object.freeze<EmoteDefinition>({
  name:                 'thinking',
  durationMilliseconds: DURATION_MILLISECONDS,
  targetPose:           (input) => ({
    eyes:      { lift: THINKING_MOTION.EYE_LIFT_UNITS, shift: THINKING_MOTION.EYE_SHIFT_UNITS },
    emoteMark: { ...EmoteMarkUtil.leavingMarkOf('thinking-dots', input, DURATION_MILLISECONDS), thinkingDotsShown: thinkingDotsShownAt(input.ageMilliseconds) },
  }),
});
