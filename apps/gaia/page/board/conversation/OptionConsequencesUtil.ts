/**
 * What an option touches, trades off and does to the Acceptance, as the asking agent noted them before it asked, and the fact lines a card
 * shows for them. An option the agent noted nothing for has none, so its card shows its label and description only.
 */
import type { BoardDecisionOptionDocument } from '../../@types/board/BoardDecisionDocuments.ts';

/** The notes as the option carries them: what it touches always as a list, the two texts `null` when the agent noted none. */
export type OptionNotes = Pick<BoardDecisionOptionDocument, 'touches' | 'tradeOff' | 'acceptanceEffect'>;

/** The notes the agent gave, each present only when it is not empty. */
export interface OptionConsequences {
  readonly touches?:          readonly string[];
  readonly tradeOff?:         string;
  readonly acceptanceEffect?: string;
}

export type OptionFact = keyof OptionConsequences;

/** A fact line under an option, keyed by its fact: the paths it touches, each a chip, or a sentence. */
export type OptionFactLine =
  | { readonly fact: 'touches'; readonly paths: readonly string[] }
  | { readonly fact: 'tradeOff' | 'acceptanceEffect'; readonly text: string };

/** The facts the agent gave for the option, or `null` when it gave none; an empty list or text counts as none. */
function consequencesOf(option: OptionNotes): OptionConsequences | null {
  const { touches } = option;
  const tradeOff = option.tradeOff ?? '';
  const acceptanceEffect = option.acceptanceEffect ?? '';
  if (touches.length === 0 && tradeOff === '' && acceptanceEffect === '') return null;
  return {
    ...(touches.length === 0 ? {} : { touches }),
    ...(tradeOff === '' ? {} : { tradeOff }),
    ...(acceptanceEffect === '' ? {} : { acceptanceEffect }),
  };
}

/** What it touches, its trade-off, its effect on the Acceptance, in that order, each only when given. */
function factLinesOf(consequences: OptionConsequences): OptionFactLine[] {
  const { touches = [], tradeOff = '', acceptanceEffect = '' } = consequences;
  return [
    ...(touches.length === 0 ? [] : [{ fact: 'touches' as const, paths: touches }]),
    ...(tradeOff === '' ? [] : [{ fact: 'tradeOff' as const, text: tradeOff }]),
    ...(acceptanceEffect === '' ? [] : [{ fact: 'acceptanceEffect' as const, text: acceptanceEffect }]),
  ];
}

export const OptionConsequencesUtil = Object.freeze({ consequencesOf, factLinesOf });
