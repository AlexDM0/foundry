/**
 * The condition dot. What matters: each condition draws the package's state dot in the tone and shape COMPONENT_LIBRARY 3.2 gives it (fill
 * holds, ring changes, dashed waits), the unreachable one in the package's failure tone, a dot the package hides from the accessibility
 * tree, since a dot is never the only sign.
 */
import { describe, expect, test } from 'bun:test';
import { StateDot }               from 'design-system/StateDot';

import { ReactElementTree }                from '../testing/ReactElementTree.ts';
import { ConditionDot, type DotCondition } from './ConditionDot.tsx';

/** The look of each condition as Gaia hands it to the package's state dot: its tone and its shape. */
const EXPECTED_LOOKS: Readonly<Record<DotCondition, readonly [string, string]>> = {
  live:        ['accent', 'solid'],
  starting:    ['accent', 'ring'],
  held:        ['accent', 'dashed-ring'],
  paused:      ['neutral', 'solid'],
  unreachable: ['error', 'solid'],
  dormant:     ['muted', 'ring'],
  unreadable:  ['muted', 'dashed-ring'],
  missing:     ['muted', 'dashed-ring'],
  outdated:    ['accent', 'dashed-ring'],
};

describe('the condition dot', () => {
  test('each condition is the package\'s state dot in the tone and shape of its condition, the unreachable one a crimson fill', () => {
    for (const [condition, look] of Object.entries(EXPECTED_LOOKS)) {
      const dot = ReactElementTree.onlyOfComponent(ReactElementTree.unfolded(<ConditionDot condition={condition as DotCondition} />), StateDot);
      expect([dot.props['tone'], dot.props['shape']]).toEqual([...look]);
    }
  });
});
