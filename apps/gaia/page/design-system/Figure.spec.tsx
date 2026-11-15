/**
 * The figure. What matters: the machine value comes first, in its own mono class, and the words of its label after it; stacked is the
 * default, and the inline form is a variant gaia.css styles, so a view that folds its figures changes no markup but the form; a value that
 * waits on User or stands at a limit is marked for the orange text, and only then.
 */
import { describe, expect, test } from 'bun:test';

import { GaiaStylesheet }   from '../testing/GaiaStylesheet.ts';
import { ReactElementTree } from '../testing/ReactElementTree.ts';
import { Figure }           from './Figure.tsx';

describe('the figure', () => {
  test('it sets the value before its label', () => {
    const unfolded = ReactElementTree.unfolded(<Figure value="10 / 12" label="agents, machine limit" />);
    const parts = ReactElementTree.hostElementsIn(unfolded, (element) => element.tag === 'span');
    expect(parts.map((part) => [part.props['className'], ReactElementTree.textOf([part])])).toEqual([
      ['gaia-figure-value', '10 / 12'],
      ['gaia-figure-label', 'agents, machine limit'],
    ]);
  });

  test('it is stacked unless it is asked to be inline', () => {
    const formOf = (figure: ReturnType<typeof Figure>) => ReactElementTree.onlyWithClass(ReactElementTree.unfolded(figure), 'gaia-figure').props['data-form'];
    expect(formOf(<Figure value="8" label="tickets ready" />)).toBe('stacked');
    expect(formOf(<Figure value="8" label="tickets ready" form="inline" />)).toBe('inline');
  });

  test('a value that waits on User is marked and styled, and a plain one is not marked', () => {
    const attentionOf = (figure: ReturnType<typeof Figure>) => ReactElementTree.onlyWithClass(ReactElementTree.unfolded(figure), 'gaia-figure').props['data-attention'];
    expect([attentionOf(<Figure value="5" label="waiting on you" attention />), attentionOf(<Figure value="11" label="tickets ready" />)]).toEqual(['', undefined]);
    expect(GaiaStylesheet.text()).toContain('.gaia-figure[data-attention] .gaia-figure-value');
  });

  test('the inline form is styled as a variant of its own', () => {
    expect(GaiaStylesheet.stylesVariant(GaiaStylesheet.text(), 'gaia-figure', 'data-form', 'inline')).toBe(true);
  });
});
