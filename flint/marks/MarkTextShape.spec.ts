/** The text of a mark. What matters: centred on the anchor at baseline 5, bold, in the hand colour, at the size given. */
import { expect, test } from 'bun:test';

import { markTextShapeOf } from './MarkTextShape.ts';

test('the text sits centred on the anchor, bold, in the hand colour', () => {
  expect(markTextShapeOf('Hi!', 12)).toMatchObject({
    kind: 'text', x: 0, y: 5, text: 'Hi!', fontSize: 12, fontWeight: 700, fill: 'hand',
  });
});
