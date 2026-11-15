/**
 * The Epics view as the epics habitat of Flint (`flint/`): there Flint ties tickets into epics, and ties a ribbon when a ticket joins one.
 */
import type { SpriteCue, SpriteHabitat, SpriteSuggestion } from '../../../flint/SpriteHabitat.ts';
import { ARRIVED_CUE }                                     from '../../../flint/SpriteHabitat.ts';

export const EPICS_CUES = Object.freeze({ TICKET_JOINED_AN_EPIC: 'ticket-joined-an-epic', } satisfies Readonly<Record<string, SpriteCue>>);

export const EPICS_SPRITE_HABITAT: SpriteHabitat = Object.freeze({
  kind:        'epics',
  description: 'The epics of the board: each with its tickets and how far they are.',
  suggestions: Object.freeze<SpriteSuggestion[]>([
    { when: ARRIVED_CUE, respond: 'wave' },
    { when: EPICS_CUES.TICKET_JOINED_AN_EPIC, respond: 'ribbon', note: 'A ticket joined an epic.' },
  ]),
});
