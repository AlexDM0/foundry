/** The fact list. What matters: each fact is a term and its value in the order given, mono unless the fact's value is words, and the layout is marked. */
import { describe, expect, test } from 'bun:test';

import { GaiaStylesheet }   from '../testing/GaiaStylesheet.ts';
import { ReactElementTree } from '../testing/ReactElementTree.ts';
import { FactList }         from './FactList.tsx';

describe('the fact list', () => {
  test('each fact is a term and its value, in order, the value in mono unless it is words', () => {
    const unfolded = ReactElementTree.unfolded(<FactList facts={[{ label: 'Turn', value: '7' }, { label: 'Forge program', value: 'Found on the path', valueFace: 'ui' }]} />);
    const pairs = ReactElementTree.hostElementsIn(unfolded, ReactElementTree.withClass('gaia-fact'))
      .map((fact) => fact.children.map((part) => (typeof part === 'string' ? part : [part.tag, part.props['data-face'], ReactElementTree.textOf([part])])));
    expect(pairs).toEqual([
      [['dt', undefined, 'Turn'], ['dd', 'mono', '7']],
      [['dt', undefined, 'Forge program'], ['dd', 'ui', 'Found on the path']],
    ]);
  });

  test('labels come first by default, and values at the line\'s end is a layout with a rule of its own', () => {
    const layoutOf = (layout?: 'values-end') => {
      const unfolded = ReactElementTree.unfolded(<FactList facts={[]} {...(layout === undefined ? {} : { layout })} />);
      return ReactElementTree.onlyWithTag(unfolded, 'dl').props['data-layout'];
    };
    expect([layoutOf(), layoutOf('values-end')]).toEqual(['labels-first', 'values-end']);
    expect(GaiaStylesheet.stylesVariant(GaiaStylesheet.text(), 'gaia-facts', 'data-layout', 'values-end')).toBe(true);
  });
});
