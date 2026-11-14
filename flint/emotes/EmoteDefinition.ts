/**
 * The contract of an emote (`02-animations.md`, Emotes): a short mark with one move of the body and one change of the eyes, as a pure
 * function of its age. An emote is a layer over the behaviour and the gesture, and its mark hides a gesture's vein or "Hi!".
 */
import type { Facing, PosePart } from '../SpritePose.ts';

export type EmoteName = 'annoyed' | 'sweatdrop' | 'surprised' | 'doubt' | 'thinking' | 'idea' | 'happy' | 'nervous';

export const EMOTE_NAMES: readonly EmoteName[] = Object.freeze(['annoyed', 'sweatdrop', 'surprised', 'doubt', 'thinking', 'idea', 'happy', 'nervous']);

export interface EmoteInput {
  /** The handoff's `age`: milliseconds since the emote started. Use it also where the handoff writes `t`. */
  readonly ageMilliseconds: number;
  readonly facing:          Facing;
  /** Under reduced motion the emote changes only the expression: no hop, bounce or shake, and a still mark. */
  readonly reducedMotion:   boolean;
}

export interface EmoteDefinition {
  readonly name:                 EmoteName;
  readonly durationMilliseconds: number;
  readonly targetPose:           (input: EmoteInput) => PosePart;
}
