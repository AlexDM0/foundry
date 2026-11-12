/** The tag. What matters: the flag's text is shown as given, and the warn tone has its own rule while attention is the base look. */
import { describe, expect, test } from 'bun:test';

import { GaiaStylesheet }   from '../testing/GaiaStylesheet.ts';
import { ReactElementTree } from '../testing/ReactElementTree.ts';
import { Tag }              from './Tag.tsx';

describe('the tag', () => {
  test('it shows its text in its tone', () => {
    const unfolded = ReactElementTree.unfolded(<Tag text="quiet · 4 sweeps" tone="warn" />);
    expect(ReactElementTree.onlyWithClass(unfolded, 'gaia-tag').props['data-tone']).toBe('warn');
    expect(ReactElementTree.textOf(unfolded)).toBe('quiet · 4 sweeps');
  });

  test('the warn tone is styled apart from the attention tone of the base rule', () => {
    expect(GaiaStylesheet.stylesVariant(GaiaStylesheet.text(), 'gaia-tag', 'data-tone', 'warn')).toBe(true);
    expect(ReactElementTree.onlyWithClass(ReactElementTree.unfolded(<Tag text="asks you · E2" tone="attention" />), 'gaia-tag').props['data-tone']).toBe('attention');
  });
});
