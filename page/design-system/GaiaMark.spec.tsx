/** Gaia's mark. What matters: it is the circle and two arcs stroked in the current colour, hidden from the accessibility tree, at the size asked. */
import { describe, expect, test } from 'bun:test';

import { ReactElementTree } from '../testing/ReactElementTree.ts';
import { GaiaMark }         from './GaiaMark.tsx';

describe('the mark', () => {
  test('it draws a circle and two arcs in the current colour, hidden from the accessibility tree, 22 px by default', () => {
    const unfolded = ReactElementTree.unfolded(<GaiaMark />);
    const mark = ReactElementTree.onlyWithTag(unfolded, 'svg');
    expect([mark.props['aria-hidden'], mark.props['stroke'], mark.props['fill'], mark.props['width'], mark.props['height']]).toEqual(['true', 'currentColor', 'none', 22, 22]);
    expect(ReactElementTree.hostElementsIn(unfolded).map((element) => element.tag)).toEqual(['svg', 'circle', 'path', 'path']);
  });

  test('it takes the size it is given, as a notification draws it larger', () => {
    const mark = ReactElementTree.onlyWithTag(ReactElementTree.unfolded(<GaiaMark sizePixels={28} />), 'svg');
    expect([mark.props['width'], mark.props['height']]).toEqual([28, 28]);
  });
});
