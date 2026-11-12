/** The micro-caps label. What matters: it keeps the element the caller asks for, so a section head stays a heading, and carries its id. */
import { describe, expect, test } from 'bun:test';

import { ReactElementTree } from '../testing/ReactElementTree.ts';
import { MicroCapsLabel }   from './MicroCapsLabel.tsx';

describe('the micro-caps label', () => {
  test('it is a span by default, with its text', () => {
    const unfolded = ReactElementTree.unfolded(<MicroCapsLabel text="This machine" />);
    expect(ReactElementTree.onlyWithClass(unfolded, 'gaia-micro-caps').tag).toBe('span');
    expect(ReactElementTree.textOf(unfolded)).toBe('This machine');
  });

  test('each element it is given is the element it renders, with the id', () => {
    for (const element of ['div', 'h2', 'h3'] as const) {
      const label = ReactElementTree.onlyWithClass(ReactElementTree.unfolded(<MicroCapsLabel text="Waiting on you" element={element} id="waiting-head" />), 'gaia-micro-caps');
      expect([label.tag, label.props['id']]).toEqual([element, 'waiting-head']);
    }
  });
});
