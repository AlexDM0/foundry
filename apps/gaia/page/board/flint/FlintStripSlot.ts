/**
 * The size Gaia draws Flint at, and the strip's Flint slot (`design-system/FlintSlot` at `60x50`) above a pipeline or document agent's
 * composer, with the habitats that live in it: the slot keeps Flint inside, so all that Flint draws there must fit its box.
 */
import { FLINT_SLOT_HABITATS } from './FlintSlotHabitats.ts';

/** Flint is 40 by 50 units; at this size it takes 30 by 37.5 pixels. */
export const BOARD_FLINT_PIXELS_FOR_ONE_UNIT = 0.75;

export const STRIP_FLINT_SLOT = Object.freeze({
  SIZE:          '60x50',
  WIDTH_PIXELS:  60,
  HEIGHT_PIXELS: 50,
} as const);

/** The habitats a strip's slot registers: the pipeline setup steps' and the ticket documents' agents. */
export const STRIP_FLINT_SLOT_HABITATS = Object.freeze([
  FLINT_SLOT_HABITATS.research,
  FLINT_SLOT_HABITATS.constitution,
  FLINT_SLOT_HABITATS.pipelineDesign,
  FLINT_SLOT_HABITATS.specAgent,
  FLINT_SLOT_HABITATS.planAgent,
]);
