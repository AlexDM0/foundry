/** The search bar. What matters: the bar and its icon, and a query that starts at its left end on the screen whatever the facing. */
import { expect, test } from 'bun:test';

import { SEARCH_BAR_PROP } from './SearchBarProp.ts';

const queryOf = (facing: 1 | -1) => SEARCH_BAR_PROP.shapesOf({ shown: 1, queryLength: 7 }, { facing, holdingHand: null }).shapes.find((shape) => shape.key === 'query');

test('the query grows from its left end on the screen', () => {
  const right = queryOf(1);
  const left = queryOf(-1);
  expect(right?.kind === 'line' ? [right.x1, right.x2] : []).toEqual([35.5, 42.5]);
  expect(left?.kind === 'line' ? [left.x1, left.x2] : []).toEqual([49.5, 42.5]);
});
