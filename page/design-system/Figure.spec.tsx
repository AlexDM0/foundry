/** The figure. What matters: the machine value comes first, in its own mono class, and the words of its label under it. */
import { describe, expect, test } from 'bun:test';

import { ReactElementTree } from '../testing/ReactElementTree.ts';
import { Figure }           from './Figure.tsx';

describe('the figure', () => {
  test('it sets the value over its label', () => {
    const unfolded = ReactElementTree.unfolded(<Figure value="10 / 12" label="agents, machine limit" />);
    const parts = ReactElementTree.hostElementsIn(unfolded, (element) => element.tag === 'span');
    expect(parts.map((part) => [part.props['className'], ReactElementTree.textOf([part])])).toEqual([
      ['gaia-figure-value', '10 / 12'],
      ['gaia-figure-label', 'agents, machine limit'],
    ]);
  });
});
