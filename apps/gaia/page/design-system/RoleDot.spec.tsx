/**
 * The role dot. What matters: each role draws the package's state dot in the tone and shape COMPONENT_LIBRARY 3.2 gives it, so a builder
 * and what asks User are orange, a reviewer teal and a landing green, a dot the package hides from the accessibility tree; Flint's brain is
 * Gaia's own diamond, orange, and grey once it ended, hidden too, since every mark is decoration only.
 */
import { describe, expect, test } from 'bun:test';
import { StateDot }               from 'design-system/StateDot';

import { GaiaStylesheet }        from '../testing/GaiaStylesheet.ts';
import { ReactElementTree }      from '../testing/ReactElementTree.ts';
import { BrainDiamond }          from './BrainDiamond.tsx';
import { type DotRole, RoleDot } from './RoleDot.tsx';

const EXPECTED_LOOKS: Readonly<Record<Exclude<DotRole, 'brain'>, readonly [string, string]>> = {
  'builder':    ['accent', 'solid'],
  'reviewer':   ['info', 'solid'],
  'needs-user': ['accent', 'dashed-ring'],
  'waiting':    ['neutral', 'dashed-ring'],
  'landed':     ['success', 'solid'],
  'forge':      ['neutral', 'solid'],
};

describe('the role dot', () => {
  test('each role is the package\'s state dot in its role\'s tone and shape', () => {
    for (const [role, look] of Object.entries(EXPECTED_LOOKS)) {
      const dot = ReactElementTree.onlyOfComponent(ReactElementTree.unfolded(<RoleDot role={role as DotRole} />), StateDot);
      expect([dot.props['tone'], dot.props['shape']]).toEqual([...look]);
    }
  });

  test('the brain is the diamond, hidden; an ended brain\'s diamond is a styled variant of its own', () => {
    const diamond = ReactElementTree.onlyWithClass(ReactElementTree.unfolded(<RoleDot role="brain" />), 'gaia-brain-diamond');
    expect([diamond.props['aria-hidden'], diamond.props['data-ended']]).toEqual(['true', undefined]);
    const ended = ReactElementTree.onlyWithClass(ReactElementTree.unfolded(<BrainDiamond ended />), 'gaia-brain-diamond');
    expect(ended.props['data-ended']).toBe('');
    expect(GaiaStylesheet.text()).toContain('.gaia-brain-diamond[data-ended]');
  });
});
