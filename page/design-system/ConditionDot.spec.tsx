/**
 * The condition dot. What matters: each condition draws the package's state dot in the tone and shape COMPONENT_LIBRARY 3.2 gives it (fill
 * holds, ring changes, dashed waits); the unreachable dot, for which the package has no crimson tone, is Gaia's own variant with a rule in
 * gaia.css; and every dot is hidden from the accessibility tree, since a dot is never the only sign.
 */
import { describe, expect, test } from 'bun:test';

import { GaiaStylesheet }                  from '../testing/GaiaStylesheet.ts';
import { ReactElementTree }                from '../testing/ReactElementTree.ts';
import { ConditionDot, type DotCondition } from './ConditionDot.tsx';

/** The look of each condition as the package draws it: its tone, and its shape (absent for a solid fill). */
const EXPECTED_LOOKS: Readonly<Record<Exclude<DotCondition, 'unreachable'>, readonly [string, string | undefined]>> = {
  live:       ['accent', undefined],
  starting:   ['accent', 'ring'],
  held:       ['accent', 'dashed-ring'],
  paused:     ['neutral', undefined],
  dormant:    ['muted', 'ring'],
  unreadable: ['muted', 'dashed-ring'],
  missing:    ['muted', 'dashed-ring'],
};

describe('the condition dot', () => {
  test('each condition the package can draw is its state dot in the tone and shape of its condition, hidden', () => {
    for (const [condition, look] of Object.entries(EXPECTED_LOOKS)) {
      const dot = ReactElementTree.onlyWithClass(ReactElementTree.unfolded(<ConditionDot condition={condition as DotCondition} />), 'design-system-state-dot');
      expect([dot.props['data-state-tone'], dot.props['data-shape'], dot.props['aria-hidden']]).toEqual([...look, 'true']);
    }
  });

  test('the unreachable dot is Gaia\'s own crimson fill, hidden and styled, since the package has no failure tone', () => {
    const dot = ReactElementTree.onlyWithClass(ReactElementTree.unfolded(<ConditionDot condition="unreachable" />), 'gaia-condition-dot');
    expect([dot.props['data-condition'], dot.props['aria-hidden']]).toEqual(['unreachable', 'true']);
    expect(GaiaStylesheet.stylesVariant(GaiaStylesheet.text(), 'gaia-condition-dot', 'data-condition', 'unreachable')).toBe(true);
  });
});
