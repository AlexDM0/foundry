/**
 * Forge's mark. What matters: it is an image named "Forge", 22 px by default, drawn in the mark's token classes as Gaia's is, with Forge's
 * hexagon ring and core and the node at Forge's place; its title and its double-click handler reach the drawing only when given.
 */
import { describe, expect, test } from 'bun:test';

import { ReactElementTree } from '../testing/ReactElementTree.ts';
import { ForgeMark }        from './ForgeMark.tsx';

describe('the forge mark', () => {
  test('it is an image named Forge, 22 px by default, with the hexagon ring and core and the node at Forge\'s place', () => {
    const unfolded = ReactElementTree.unfolded(<ForgeMark />);
    const mark = ReactElementTree.onlyWithTag(unfolded, 'svg');
    expect([mark.props['role'], mark.props['aria-label'], mark.props['width'], mark.props['onDoubleClick']]).toEqual(['img', 'Forge', 22, undefined]);
    expect(ReactElementTree.hostElementsIn(unfolded, ReactElementTree.withTag('title'))).toEqual([]);
    expect(ReactElementTree.onlyWithClass(unfolded, 'gaia-mark-ring').tag).toBe('path');
    expect(ReactElementTree.onlyWithClass(unfolded, 'gaia-mark-core').tag).toBe('path');
    const node = ReactElementTree.onlyWithClass(unfolded, 'gaia-mark-node-core');
    expect([node.props['cx'], node.props['cy'], node.props['r']]).toEqual(['48.02', '22.75', '3.4']);
  });

  test('a title and a double-click handler reach the drawing when given', () => {
    const presses: string[] = [];
    const unfolded = ReactElementTree.unfolded(<ForgeMark title="Double-click to wake Flint's brain" onDoubleClick={() => presses.push('wake')} />);
    expect(ReactElementTree.textOf([ReactElementTree.onlyWithTag(unfolded, 'title')])).toBe('Double-click to wake Flint\'s brain');
    ReactElementTree.dispatch(ReactElementTree.onlyWithTag(unfolded, 'svg'), 'onDoubleClick');
    expect(presses).toEqual(['wake']);
  });
});
