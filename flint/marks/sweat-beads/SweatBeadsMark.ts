/** The sweat beads of `01-character.md`: three drops that fly off, each placed and turned by the emote that shows them. */
import type { Shape }        from '../../drawing/Shape.ts';
import { markDefinition }    from '../MarkDefinition.ts';
import { SWEAT_BEADS_SHAPE } from './constants/SweatBeadsValues.ts';

export interface SweatBeadPose {
  readonly x:           number;
  readonly y:           number;
  readonly turnDegrees: number;
  readonly opacity:     number;
}

export interface SweatBeadsDetails {
  readonly beads: readonly SweatBeadPose[];
}

export const SWEAT_BEADS_MARK = markDefinition({
  name:        'sweat-beads',
  anchorX:     SWEAT_BEADS_SHAPE.ANCHOR_X_UNITS,
  anchorY:     SWEAT_BEADS_SHAPE.ANCHOR_Y_UNITS,
  scale:       SWEAT_BEADS_SHAPE.SCALE,
  restDetails: Object.freeze<SweatBeadsDetails>({ beads: Object.freeze([]) }),
  shapesOf:    (details: SweatBeadsDetails) => details.beads.slice(0, SWEAT_BEADS_SHAPE.COUNT).map((bead, i): Shape => ({
    kind:      'path',
    key:       `bead-${i}`,
    pathData:  SWEAT_BEADS_SHAPE.PATH,
    fill:      'water',
    opacity:   bead.opacity,
    transform: [{ translateX: bead.x, translateY: bead.y }, { rotateDegrees: bead.turnDegrees }],
  })),
});
