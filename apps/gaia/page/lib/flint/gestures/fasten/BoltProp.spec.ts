/** The bolt. What matters: the rectangle, which slides in 8 units from the side away from Flint as it fades in. */
import { expect, test } from 'bun:test';

import { BOLT_PROP } from './BoltProp.ts';

test('it fades in while it slides in from the side away from Flint', () => {
  expect(BOLT_PROP.shapesOf({ shown: 0.5 }, { facing: 1, holdingHand: null }).shapes).toEqual([{
    kind: 'rectangle', key: 'bolt', x: 34, y: -26, width: 24, height: 4, fill: 'bolt', opacity: 0.5, transform: [{ translateX: 4, translateY: 0 }],
  }]);
});
