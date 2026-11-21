/**
 * The Progress chart as the timeline habitat of Flint (`flint/`): there Flint lays the bars. When a ticket starts, the view has Flint lay
 * the bar along its row (`lay-bar-along`, through Flint's handle), or lay a bar where it stands when the row is not shown.
 */
import type { SpriteCue, SpriteHabitat, SpriteSuggestion } from 'flint/SpriteHabitat';
import { ARRIVED_CUE }                                     from 'flint/SpriteHabitat';

export const TIMELINE_CUES = Object.freeze({ STARTED_BAR_IS_NOT_SHOWN: 'started-bar-is-not-shown', } satisfies Readonly<Record<string, SpriteCue>>);

export const TIMELINE_SPRITE_HABITAT: SpriteHabitat = Object.freeze({
  kind:        'timeline',
  description: 'The progress chart: a bar on the timeline for each task of the board, from its start to its end.',
  suggestions: Object.freeze<SpriteSuggestion[]>([
    { when: ARRIVED_CUE, respond: 'wave' },
    { when: TIMELINE_CUES.STARTED_BAR_IS_NOT_SHOWN, respond: 'lay-bar', note: 'A ticket started, and its row is not shown in this range.' },
  ]),
});
