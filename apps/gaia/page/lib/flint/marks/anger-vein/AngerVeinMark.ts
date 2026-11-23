/** The anger vein, which the Annoyed emote and the angry variants share. */
import { markDefinition, NO_MARK_DETAILS } from '../MarkDefinition.ts';
import { ANGER_VEIN_SHAPE }                from './constants/AngerVeinValues.ts';

export const ANGER_VEIN_MARK = markDefinition({
  name:        'anger-vein',
  anchorX:     ANGER_VEIN_SHAPE.ANCHOR_X_UNITS,
  anchorY:     ANGER_VEIN_SHAPE.ANCHOR_Y_UNITS,
  scale:       ANGER_VEIN_SHAPE.SCALE,
  restDetails: NO_MARK_DETAILS,
  shapesOf:    () => [{
    kind: 'path', key: 'vein', pathData: ANGER_VEIN_SHAPE.PATH, fill: 'none', stroke: 'alarm', strokeWidth: ANGER_VEIN_SHAPE.STROKE_UNITS, lineCap: 'round',
  }],
});
