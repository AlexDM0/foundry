/** The two glints of `01-character.md` that the Happy emote shows, each a square turned 45 degrees. */
import type { FlintColourRole }            from '../../constants/Palette.ts';
import type { Shape }                      from '../../drawing/Shape.ts';
import { markDefinition, NO_MARK_DETAILS } from '../MarkDefinition.ts';
import { SHARED_MARK_ANCHOR }              from '../constants/MarkShapes.ts';
import { HAPPY_GLINTS_SHAPE }              from './constants/HappyGlintsValues.ts';

function glintOf(key: string, glintX: number, glintY: number, side: number, fill: FlintColourRole): Shape {
  return {
    kind:      'rectangle',
    key,
    x:         glintX,
    y:         glintY,
    width:     side,
    height:    side,
    fill,
    transform: [{ rotateDegrees: HAPPY_GLINTS_SHAPE.TURN_DEGREES, aboutX: glintX + (side / 2), aboutY: glintY + (side / 2) }],
  };
}

export const HAPPY_GLINTS_MARK = markDefinition({
  name:        'happy-glints',
  anchorX:     SHARED_MARK_ANCHOR.ANCHOR_X_UNITS,
  anchorY:     SHARED_MARK_ANCHOR.ANCHOR_Y_UNITS,
  scale:       SHARED_MARK_ANCHOR.SCALE,
  restDetails: NO_MARK_DETAILS,
  shapesOf:    () => [
    glintOf('large-glint', HAPPY_GLINTS_SHAPE.LARGE_X_UNITS, HAPPY_GLINTS_SHAPE.LARGE_Y_UNITS, HAPPY_GLINTS_SHAPE.LARGE_SIDE_UNITS, 'body'),
    glintOf('small-glint', HAPPY_GLINTS_SHAPE.SMALL_X_UNITS, HAPPY_GLINTS_SHAPE.SMALL_Y_UNITS, HAPPY_GLINTS_SHAPE.SMALL_SIDE_UNITS, 'emberLight'),
  ],
});
