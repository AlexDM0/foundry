/**
 * The bug Flint holds once Chase the bug has caught it: the chase's own bug, drawn between the closed hands, in front of the body and
 * behind the near hand, so it moves with Flint as the hands do. It shrinks away when it becomes a ticket.
 */
import type { Facing }        from '../../SpriteGeometry.ts';
import { propDefinition }     from '../../props/PropDefinition.ts';
import { PropEasingUtil }     from '../../props/PropEasingUtil.ts';
import { ChasePageShapeUtil } from './ChasePageShapeUtil.ts';

export interface HeldBugState {
  readonly shown:       number;
  /** The centre of the bug, in sprite units from the bottom tip, for Flint facing right. */
  readonly x:           number;
  readonly y:           number;
  readonly scale:       number;
  /** The way the bug faces, for Flint facing right. */
  readonly facing:      Facing;
  readonly turnDegrees: number;
}

/** The behaviour gives each value on each frame; only a bug the behaviour no longer gives fades, where it was last drawn. */
function easedHeldBugOf(drawn: HeldBugState, target: HeldBugState, handFraction: number): HeldBugState {
  if (target.shown > 0) return target;
  return { ...drawn, shown: PropEasingUtil.easedTowards(drawn.shown, target.shown, handFraction) };
}

export const HELD_BUG_PROP = propDefinition({
  name:   'heldBug',
  hidden: Object.freeze<HeldBugState>({
    shown: 0, x: 0, y: 0, scale: 1, facing: 1, turnDegrees: 0,
  }),
  layer:    'in-front-of-body',
  easedOf:  easedHeldBugOf,
  shapesOf: (state: HeldBugState) => ({
    opacity: state.shown,
    shapes:  ChasePageShapeUtil.bugShapesOf({
      centre: { x: state.x, y: state.y }, scale: state.scale, facing: state.facing, turnDegrees: state.turnDegrees,
    }),
  }),
});
