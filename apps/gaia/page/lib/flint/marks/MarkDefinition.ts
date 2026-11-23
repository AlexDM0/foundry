/**
 * The contract of a mark: a small drawing that an emote or a gesture shows at an anchor relative to the
 * bottom tip of the body. The anchor's x follows the facing; the mark itself is never mirrored, so its text stays readable. A mark's
 * details are what changes inside it from frame to frame, such as the dots that show.
 */
import type { GradientDefinition, Shape } from '../drawing/Shape.ts';

export interface MarkDefinition<Name extends string = string, Details = unknown> {
  readonly name:        Name;
  readonly anchorX:     number;
  readonly anchorY:     number;
  readonly scale:       number;
  /** The details of the mark at rest: fully shown, before an emote changes them. */
  readonly restDetails: Details;
  readonly gradients?:  readonly GradientDefinition[];
  /** The shapes around the anchor, before the scale; the renderer places, scales and fades them. */
  shapesOf(details: Details): readonly Shape[];
}

/** Keeps the literal name and the details type of a mark definition, so the mark catalog can derive the pose type from it. */
export function markDefinition<const Name extends string, Details>(definition: MarkDefinition<Name, Details>): MarkDefinition<Name, Details> {
  return Object.freeze(definition);
}

/** A mark with no details. */
export type NoMarkDetails = Readonly<Record<string, never>>;

export const NO_MARK_DETAILS: NoMarkDetails = Object.freeze({});
