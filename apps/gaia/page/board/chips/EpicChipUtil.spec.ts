/**
 * The epic chips' model. What matters: up to the limit every epic shows in its order, the rest fold into one "+N" naming them on hover, and
 * no limit shows them all; a chip's title names it as an epic.
 */
import { describe, expect, test } from 'bun:test';

import { CARD_EPIC_CHIP_LIMIT, EpicChipUtil } from './EpicChipUtil.ts';

const EPICS = [
  { key: 'checkout', title: 'Example checkout', slot: 1 },
  { key: 'account', title: 'Example account', slot: 2 },
  { key: 'search', title: 'Example search', slot: 3 },
  { key: 'billing', title: 'Example billing', slot: 4 },
];

describe('the epic chips', () => {
  test('a card shows its first two epics, then +N naming the rest', () => {
    const model = EpicChipUtil.epicChipsOf(EPICS, CARD_EPIC_CHIP_LIMIT);
    expect(model.shown.map((epic) => epic.key)).toEqual(['checkout', 'account']);
    expect(model.overflow).toEqual({ countText: '+2', title: 'Also in Example search, Example billing' });
  });

  test('within the limit, or with none, every epic shows and nothing folds', () => {
    expect(EpicChipUtil.epicChipsOf(EPICS.slice(0, 2), CARD_EPIC_CHIP_LIMIT).overflow).toBeNull();
    expect(EpicChipUtil.epicChipsOf(EPICS).shown).toHaveLength(EPICS.length);
  });

  test('a chip is titled as an epic', () => {
    expect(EpicChipUtil.chipTitleOf({ title: 'Example checkout' })).toBe('Epic: Example checkout');
  });
});
