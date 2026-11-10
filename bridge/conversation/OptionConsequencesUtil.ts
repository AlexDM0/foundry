/**
 * What an option touches, trades off and does to the Acceptance, as the asking agent noted them before it asked, and the fact lines a card
 * shows for them. An option the agent noted nothing for has none, so its card shows its label and description only.
 */
import type { DecisionOptionDocument } from '../@types/ConversationDocuments.ts';

export type OptionConsequences = Pick<DecisionOptionDocument, 'touches' | 'tradeOff' | 'acceptanceEffect'>;

/** A fact line under an option: the paths it touches, each a chip, or a sentence. */
export type OptionFactLine =
  | { readonly label: 'Touches'; readonly paths: readonly string[] }
  | { readonly label: 'Trade-off' | 'Acceptance'; readonly text: string };

/** The facts the agent gave for the option, or `null` when it gave none; an empty list or text counts as none. */
function consequencesOf(option: OptionConsequences): OptionConsequences | null {
  const touches = option.touches ?? [];
  const tradeOff = option.tradeOff ?? '';
  const acceptanceEffect = option.acceptanceEffect ?? '';
  if (touches.length === 0 && tradeOff === '' && acceptanceEffect === '') return null;
  return {
    ...(touches.length === 0 ? {} : { touches }),
    ...(tradeOff === '' ? {} : { tradeOff }),
    ...(acceptanceEffect === '' ? {} : { acceptanceEffect }),
  };
}

/** Touches, Trade-off, Acceptance, in that order, each only when given. */
function factLinesOf(consequences: OptionConsequences): OptionFactLine[] {
  const { touches = [], tradeOff = '', acceptanceEffect = '' } = consequences;
  return [
    ...(touches.length === 0 ? [] : [{ label: 'Touches' as const, paths: touches }]),
    ...(tradeOff === '' ? [] : [{ label: 'Trade-off' as const, text: tradeOff }]),
    ...(acceptanceEffect === '' ? [] : [{ label: 'Acceptance' as const, text: acceptanceEffect }]),
  ];
}

export const OptionConsequencesUtil = Object.freeze({ consequencesOf, factLinesOf });
