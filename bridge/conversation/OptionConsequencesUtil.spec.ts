/**
 * An option's consequences as the asking agent noted them. What matters: an option with nothing noted, or only an empty list or empty
 * texts, has no consequences, so its card stays as it was asked; and the fact lines come Touches, Trade-off, Acceptance, each only when
 * given.
 */
import { describe, expect, test } from 'bun:test';

import { OptionConsequencesUtil } from './OptionConsequencesUtil.ts';

describe('OptionConsequencesUtil.consequencesOf', () => {
  test('an option with nothing noted, or only empties, has none', () => {
    expect(OptionConsequencesUtil.consequencesOf({})).toBeNull();
    expect(OptionConsequencesUtil.consequencesOf({ touches: [], tradeOff: '', acceptanceEffect: '' })).toBeNull();
  });

  test('keeps exactly the facts given, leaving out an empty one', () => {
    expect(OptionConsequencesUtil.consequencesOf({ touches: ['src/theme/tokens.css'], tradeOff: '' })).toEqual({ touches: ['src/theme/tokens.css'] });
    expect(OptionConsequencesUtil.consequencesOf({ acceptanceEffect: 'A2 fails' })).toEqual({ acceptanceEffect: 'A2 fails' });
  });
});

describe('OptionConsequencesUtil.factLinesOf', () => {
  test('lists what it touches, its trade-off and its Acceptance effect in that order, each keyed by its fact', () => {
    expect(OptionConsequencesUtil.factLinesOf({ acceptanceEffect: 'A2 fails', tradeOff: 'Smallest change', touches: ['src/account/Layout.tsx'] })).toEqual([
      { fact: 'touches', paths: ['src/account/Layout.tsx'] },
      { fact: 'tradeOff', text: 'Smallest change' },
      { fact: 'acceptanceEffect', text: 'A2 fails' },
    ]);
  });

  test('leaves out what was not given', () => {
    expect(OptionConsequencesUtil.factLinesOf({ tradeOff: 'Smallest change' })).toEqual([{ fact: 'tradeOff', text: 'Smallest change' }]);
  });
});
