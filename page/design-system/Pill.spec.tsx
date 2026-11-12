/** The pill. What matters: the kind's text is shown as given, and the error tone has its own rule while attention is the base look. */
import { describe, expect, test } from 'bun:test';

import { GaiaStylesheet }   from '../testing/GaiaStylesheet.ts';
import { ReactElementTree } from '../testing/ReactElementTree.ts';
import { Pill }             from './Pill.tsx';

describe('the pill', () => {
  test('it shows its text in its tone', () => {
    const unfolded = ReactElementTree.unfolded(<Pill text="Escalated" tone="error" />);
    expect(ReactElementTree.onlyWithClass(unfolded, 'gaia-pill').props['data-tone']).toBe('error');
    expect(ReactElementTree.textOf(unfolded)).toBe('Escalated');
  });

  test('the error tone is styled apart from the attention tone of the base rule', () => {
    expect(GaiaStylesheet.stylesVariant(GaiaStylesheet.text(), 'gaia-pill', 'data-tone', 'error')).toBe(true);
    expect(ReactElementTree.onlyWithClass(ReactElementTree.unfolded(<Pill text="Question" tone="attention" />), 'gaia-pill').props['data-tone']).toBe('attention');
  });
});
