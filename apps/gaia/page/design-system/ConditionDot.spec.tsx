/**
 * The condition dot. What matters: each condition draws the package's state dot in the tone and shape COMPONENT_LIBRARY 3.2 gives it (fill
 * holds, ring changes, dashed waits), a dot the package hides from the accessibility tree; the unreachable dot, for which the package has
 * no crimson tone, is Gaia's own variant with a rule in gaia.css, hidden too, since a dot is never the only sign.
 */
import { describe, expect, test } from 'bun:test';
import { StateDot }               from 'design-system/StateDot';

import { GaiaStylesheet }                  from '../testing/GaiaStylesheet.ts';
import { ReactElementTree }                from '../testing/ReactElementTree.ts';
import { ConditionDot, type DotCondition } from './ConditionDot.tsx';

/** The look of each condition as Gaia hands it to the package's state dot: its tone and its shape. */
const EXPECTED_LOOKS: Readonly<Record<Exclude<DotCondition, 'unreachable'>, readonly [string, string]>> = {
  live:       ['accent', 'solid'],
  starting:   ['accent', 'ring'],
  held:       ['accent', 'dashed-ring'],
  paused:     ['neutral', 'solid'],
  dormant:    ['muted', 'ring'],
  unreadable: ['muted', 'dashed-ring'],
  missing:    ['muted', 'dashed-ring'],
};

describe('the condition dot', () => {
  test('each condition the package can draw is its state dot in the tone and shape of its condition', () => {
    for (const [condition, look] of Object.entries(EXPECTED_LOOKS)) {
      const dot = ReactElementTree.onlyOfComponent(ReactElementTree.unfolded(<ConditionDot condition={condition as DotCondition} />), StateDot);
      expect([dot.props['tone'], dot.props['shape']]).toEqual([...look]);
    }
  });

  test('the unreachable dot is Gaia\'s own crimson fill, hidden and styled, since the package has no failure tone', () => {
    const dot = ReactElementTree.onlyWithClass(ReactElementTree.unfolded(<ConditionDot condition="unreachable" />), 'gaia-condition-dot');
    expect([dot.props['data-condition'], dot.props['aria-hidden']]).toEqual(['unreachable', 'true']);
    expect(GaiaStylesheet.stylesVariant(GaiaStylesheet.text(), 'gaia-condition-dot', 'data-condition', 'unreachable')).toBe(true);
  });
});
