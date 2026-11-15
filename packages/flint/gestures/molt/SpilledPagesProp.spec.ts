/**
 * The spilled pages. What matters: each page is a paper rectangle of 5 by 6 with a thin grey edge, centred on its place and turned around
 * it; five hidden to start.
 */
import { expect, test } from 'bun:test';

import { SPILLED_PAGES_PROP } from './SpilledPagesProp.ts';

test('a page of 5 by 6 centred on its place, turned around it, faded by its own opacity', () => {
  const drawing = SPILLED_PAGES_PROP.shapesOf({
    shown: 1,
    pages: [{
      x: 10, y: -50, turnDegrees: 40, opacity: 0.5
    }]
  }, { facing: 1, holdingHand: null });
  expect(drawing.shapes).toEqual([{
    kind:        'rectangle',
    key:         'page-0',
    x:           7.5,
    y:           -53,
    width:       5,
    height:      6,
    fill:        'paper',
    stroke:      'paperEdge',
    strokeWidth: 0.8,
    opacity:     0.5,
    transform:   [{ rotateDegrees: 40, aboutX: 10, aboutY: -50 }],
  }]);
  expect(SPILLED_PAGES_PROP.hidden.pages).toHaveLength(5);
});
