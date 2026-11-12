/** The role dot. What matters: each role is a data attribute with a rule of its own in gaia.css, and the dot is decoration only. */
import { describe, expect, test } from 'bun:test';

import { GaiaStylesheet }        from '../testing/GaiaStylesheet.ts';
import { ReactElementTree }      from '../testing/ReactElementTree.ts';
import { type DotRole, RoleDot } from './RoleDot.tsx';

const EVERY_ROLE: Readonly<Record<DotRole, true>> = {
  'builder':    true,
  'reviewer':   true,
  'waiting':    true,
  'landed':     true,
  'needs-user': true,
  'forge':      true,
};

describe('the role dot', () => {
  test('each role is carried as data-role, hidden from the accessibility tree, and styled', () => {
    const stylesheetText = GaiaStylesheet.text();
    for (const role of Object.keys(EVERY_ROLE) as DotRole[]) {
      const dot = ReactElementTree.onlyWithClass(ReactElementTree.unfolded(<RoleDot role={role} />), 'gaia-role-dot');
      expect([dot.props['data-role'], dot.props['aria-hidden']]).toEqual([role, 'true']);
      expect(GaiaStylesheet.stylesVariant(stylesheetText, 'gaia-role-dot', 'data-role', role)).toBe(true);
    }
  });
});
