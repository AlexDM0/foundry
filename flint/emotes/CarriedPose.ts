/**
 * Implements `02-animations.md`, "Carried": while the user drags Flint, it shows the eyes, the shake and the sweat beads of the Nervous
 * emote for as long as the drag goes on, with no fade. Where Flint hangs below the pointer is the mind's.
 */
import type { Facing, PosePart } from '../SpritePose.ts';
import { emoteMarkAtRest }       from '../SpritePose.ts';
import { nervousPartOf }         from './NervousEmote.ts';

export interface CarriedInput {
  /** Since the drag started. */
  readonly carriedMilliseconds: number;
  readonly facing:              Facing;
  readonly reducedMotion:       boolean;
}

export function carriedPartOf(input: CarriedInput): PosePart {
  return nervousPartOf({ ageMilliseconds: input.carriedMilliseconds, facing: input.facing, reducedMotion: input.reducedMotion }, emoteMarkAtRest('sweat-beads'));
}
