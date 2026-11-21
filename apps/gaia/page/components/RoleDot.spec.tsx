/**
 * The role dot. What matters: each role draws the package's state dot in the tone and shape `docs/design/components.md` 3.2 gives it, so a builder
 * and what asks User are orange, a reviewer teal and a landing green; the
 * package hides the dot from the accessibility tree, since every mark is decoration only. A dot pulses only when asked to.
 */
import { describe, expect, test } from 'bun:test';
import type { ReactNode }         from 'react';
import { StateDot }               from '../lib/design-system/DesignSystemInterface.ts';

import { ReactElementTree }      from '../testing/ReactElementTree.ts';
import { type DotRole, RoleDot } from './RoleDot.tsx';

const EXPECTED_LOOKS: Readonly<Record<DotRole, readonly [string, string]>> = {
  'builder':    ['accent', 'solid'],
  'reviewer':   ['info', 'solid'],
  'needs-user': ['accent', 'dashed-ring'],
  'waiting':    ['neutral', 'dashed-ring'],
  'landed':     ['success', 'solid'],
  'forge':      ['neutral', 'solid'],
};

function drawnDotOf(element: ReactNode) {
  return ReactElementTree.onlyOfComponent(ReactElementTree.unfolded(element), StateDot);
}

describe('the role dot', () => {
  test('each role is the package\'s state dot in its role\'s tone and shape', () => {
    for (const [role, look] of Object.entries(EXPECTED_LOOKS)) {
      const dot = drawnDotOf(<RoleDot role={role as DotRole} />);
      expect([dot.props['tone'], dot.props['shape']]).toEqual([...look]);
    }
  });

  test('a dot pulses only when asked to', () => {
    expect(drawnDotOf(<RoleDot role="builder" />).props['pulsing']).toBe(false);
    expect(drawnDotOf(<RoleDot role="builder" pulsing />).props['pulsing']).toBe(true);
  });
});
