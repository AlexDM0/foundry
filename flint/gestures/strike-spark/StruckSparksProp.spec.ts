/**
 * The sparks of Strike a spark. What matters: the small sparks come first, each a small spark of the shared vocabulary; the Watcher is the
 * spark of a Watcher with its core, scaled around its own centre after its own turn, so it grows in place; and its hidden state draws.
 */
import { expect, test } from 'bun:test';

import { STRUCK_SPARKS_PROP } from './StruckSparksProp.ts';

test('the small sparks, then the Watcher and its core, scaled around the Watcher centre', () => {
  const drawing = STRUCK_SPARKS_PROP.shapesOf({
    shown:          1,
    watcherX:       40,
    watcherY:       -40,
    watcherScale:   0.5,
    watcherOpacity: 1,
    smallSparks:    [{
      x: 24, y: -28, turnDegrees: 90, opacity: 0.5,
    }],
  }, { facing: 1, holdingHand: null });
  expect(drawing.shapes.map((shape) => shape.key)).toEqual(['small-spark-0', 'watcher', 'watcher-core']);
  expect(drawing.shapes[0]).toMatchObject({ width: 2.5, opacity: 0.5, transform: [{ translateX: 24, translateY: -28 }, { rotateDegrees: 90 }] });
  expect(drawing.shapes[1]).toMatchObject({
    kind:      'rectangle',
    width:     4,
    fill:      'body',
    transform: [
      { translateX: 40, translateY: -40 },
      { scaleX: 0.5, scaleY: 0.5 },
      { translateX: -40, translateY: 40 },
      { rotateDegrees: 45, aboutX: 40, aboutY: -40 },
    ],
  });
  expect(drawing.shapes[2]).toMatchObject({ width: 1.6, fill: 'emberLight' });
});

test('the hidden state draws the Watcher at scale 0 and no small spark', () => {
  const drawing = STRUCK_SPARKS_PROP.shapesOf(STRUCK_SPARKS_PROP.hidden, { facing: 1, holdingHand: null });
  expect(drawing.opacity).toBe(0);
  expect(drawing.shapes.map((shape) => shape.key)).toEqual(['watcher', 'watcher-core']);
});
