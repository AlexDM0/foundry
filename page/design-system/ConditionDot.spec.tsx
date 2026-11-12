/**
 * The condition dot. What matters: each condition is a data attribute with a rule of its own in gaia.css, and the dot is hidden from the
 * accessibility tree, since a dot is never the only sign.
 */
import { describe, expect, test } from 'bun:test';

import { GaiaStylesheet }                  from '../testing/GaiaStylesheet.ts';
import { ReactElementTree }                from '../testing/ReactElementTree.ts';
import { ConditionDot, type DotCondition } from './ConditionDot.tsx';

const EVERY_CONDITION: Readonly<Record<DotCondition, true>> = {
  live:        true,
  paused:      true,
  held:        true,
  starting:    true,
  dormant:     true,
  unreachable: true,
  unreadable:  true,
  missing:     true,
};

describe('the condition dot', () => {
  test('each condition is carried as data-condition, hidden from the accessibility tree, and styled', () => {
    const stylesheetText = GaiaStylesheet.text();
    for (const condition of Object.keys(EVERY_CONDITION) as DotCondition[]) {
      const dot = ReactElementTree.onlyWithClass(ReactElementTree.unfolded(<ConditionDot condition={condition} />), 'gaia-condition-dot');
      expect([dot.props['data-condition'], dot.props['aria-hidden']]).toEqual([condition, 'true']);
      expect(GaiaStylesheet.stylesVariant(stylesheetText, 'gaia-condition-dot', 'data-condition', condition)).toBe(true);
    }
  });
});
