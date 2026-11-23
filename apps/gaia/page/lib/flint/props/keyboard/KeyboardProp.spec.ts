/** The keyboard. What matters: the rectangle, turned -9 degrees; it slides 5 units up as it fades in, and jolts down. */
import { expect, test } from 'bun:test';

import { KEYBOARD_PROP } from './KeyboardProp.ts';

const CONTEXT = { facing: 1, holdingHand: null } as const;

test('it is the turned rectangle of the character sheet, behind the body', () => {
  const drawing = KEYBOARD_PROP.shapesOf({ shown: 1, drop: 0 }, CONTEXT);
  expect(drawing.shapes).toEqual([{
    kind:         'rectangle',
    key:          'keyboard',
    x:            14,
    y:            -4,
    width:        30,
    height:       4,
    cornerRadius: 1,
    fill:         'keyboard',
    stroke:       'graphite',
    strokeWidth:  1.5,
    transform:    [{ rotateDegrees: -9, aboutX: 14, aboutY: -2 }],
  }]);
  expect(KEYBOARD_PROP.layer).toBe('behind-body');
});

test('it fades in while it slides 5 up, and its jolt moves it down', () => {
  expect(KEYBOARD_PROP.shapesOf({ shown: 0.5, drop: 0 }, CONTEXT)).toMatchObject({ opacity: 0.5, transform: [{ translateX: 0, translateY: 2.5 }] });
  expect(KEYBOARD_PROP.shapesOf({ shown: 1, drop: 1.6 }, CONTEXT).transform).toEqual([{ translateX: 0, translateY: 1.6 }]);
});
