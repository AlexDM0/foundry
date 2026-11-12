/** The list card. What matters: it is a named list whose rows keep the order given. */
import { describe, expect, test } from 'bun:test';

import { ReactElementTree } from '../testing/ReactElementTree.ts';
import { ListCard }         from './ListCard.tsx';

describe('the list card', () => {
  test('it is a named list of rows in the order given', () => {
    const unfolded = ReactElementTree.unfolded(<ListCard label="Waiting on you" rows={[{ key: 'E4', content: 'Escalated E4' }, { key: '#015', content: 'Draft #015' }]} />);
    const list = ReactElementTree.onlyWithClass(unfolded, 'gaia-list-card');
    expect([list.tag, list.props['aria-label']]).toEqual(['ul', 'Waiting on you']);
    expect(ReactElementTree.hostElementsIn(unfolded, ReactElementTree.withClass('gaia-list-card-row')).map((row) => [row.tag, ReactElementTree.textOf([row])])).toEqual([
      ['li', 'Escalated E4'],
      ['li', 'Draft #015'],
    ]);
  });
});
