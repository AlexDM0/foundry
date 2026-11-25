/**
 * The book. What matters: turned 20 degrees around (39, -27), dropped 11 and held 3 nearer to Flint; the turning page shows only while a
 * page turns, before the spine.
 */
import { expect, test } from 'bun:test';

import { BOOK_PROP } from './BookProp.ts';

test('the book is turned and dropped, and its turning page is drawn between the text and the spine', () => {
  const turning = BOOK_PROP.shapesOf({ shown: 1, turningPageSpread: 0 }, { facing: 1, holdingHand: null });
  expect(turning.transform).toEqual([{ translateX: -3, translateY: 11 }, { rotateDegrees: 20, aboutX: 39, aboutY: -27 }]);
  expect(turning.shapes.map((shape) => shape.key)).toEqual(['cover', 'bookmark', 'pages-below', 'left-page', 'right-page', 'text', 'turning-page', 'spine']);
  const page = turning.shapes[6];
  expect(page?.kind === 'polygon' ? page.points : []).toEqual([{ x: 39, y: -38.5 }, { x: 39, y: -44.5 }, { x: 39, y: -21.5 }, { x: 39, y: -15.5 }]);
  expect(BOOK_PROP.shapesOf({ shown: 1, turningPageSpread: null }, { facing: 1, holdingHand: null }).shapes.map((shape) => shape.key)).not.toContain('turning-page');
});
