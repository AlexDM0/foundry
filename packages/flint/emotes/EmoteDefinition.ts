/**
 * The contract of an emote (`02-animations.md`, Emotes): a short mark with one move of the body and one change of the eyes, as a pure
 * function of its age. An emote is a layer over the behaviour and the gesture, and its mark hides the mark a gesture shows. Its name is
 * its intent on the fixed intent list.
 */
import type { Facing }   from '../SpriteGeometry.ts';
import type { PosePart } from '../SpritePose.ts';

export interface EmoteInput {
  /** The handoff's `age`: milliseconds since the emote started. Use it also where the handoff writes `t`. */
  readonly ageMilliseconds: number;
  readonly facing:          Facing;
  /** Under reduced motion the emote changes only the expression: no hop, bounce or shake, and a still mark. */
  readonly reducedMotion:   boolean;
}

export interface EmoteDefinition<Name extends string = string> {
  readonly name:                 Name;
  readonly durationMilliseconds: number;
  targetPose(input: EmoteInput): PosePart;
}

/** Keeps the literal name of an emote definition, so the catalog can derive the emote intents from it. */
export function emoteDefinition<const Name extends string>(definition: EmoteDefinition<Name>): EmoteDefinition<Name> {
  return Object.freeze(definition);
}
