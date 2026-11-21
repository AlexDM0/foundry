/**
 * The shapes of Chase the bug, built from the shared vocabulary: the bug at its scale, facing the way it runs, as a page shape while it
 * runs and as the held bug's prop once it is caught; and, as page shapes in overlay units, the dashed crimson link to the element it came
 * from and the mini sheet with a crimson dot that the bug becomes.
 */
import type { Facing, Point }               from '../../SpriteGeometry.ts';
import type { Shape, TransformStep }        from '../../drawing/Shape.ts';
import { BugShapeUtil }                     from '../../props/shapes/BugShapeUtil.ts';
import { PaperShapeUtil }                   from '../../props/shapes/PaperShapeUtil.ts';
import { CHASE_BUG_LINK, CHASE_BUG_TICKET } from './constants/ChaseBugValues.ts';

export interface PageBug {
  readonly centre:      Point;
  readonly scale:       number;
  readonly facing:      Facing;
  readonly turnDegrees: number;
}

/** The bug at its centre, scaled about it and mirrored to the way it faces. */
function bugShapesOf(bug: PageBug): readonly Shape[] {
  const scaling: readonly TransformStep[] = [
    { translateX: bug.centre.x, translateY: bug.centre.y },
    { scaleX: bug.scale * bug.facing, scaleY: bug.scale },
    { translateX: -bug.centre.x, translateY: -bug.centre.y },
  ];
  return BugShapeUtil.bugOf({
    key: 'bug', centreX: bug.centre.x, centreY: bug.centre.y, turnDegrees: bug.turnDegrees,
  }).map((shape): Shape => ({ ...shape, transform: [...scaling, ...(shape.transform ?? [])] }));
}

function linkShapeOf(from: Point, to: Point): Shape {
  return {
    kind:        'line',
    key:         'link',
    x1:          from.x,
    y1:          from.y,
    x2:          to.x,
    y2:          to.y,
    stroke:      'alarm',
    strokeWidth: CHASE_BUG_LINK.STROKE_UNITS,
    dash:        [CHASE_BUG_LINK.DASH_UNITS, CHASE_BUG_LINK.GAP_UNITS],
  };
}

/** The mini sheet with a crimson dot, its centre at the point given. */
function ticketShapesOf(centre: Point, opacity: number): readonly Shape[] {
  const transform = PaperShapeUtil.miniSheetTransformOf(centre);
  return [
    { ...PaperShapeUtil.paperOf({ key: 'ticket' }), opacity, transform },
    {
      kind:    'circle',
      key:     'ticket-dot',
      centreX: CHASE_BUG_TICKET.DOT_CENTRE_X_UNITS,
      centreY: CHASE_BUG_TICKET.DOT_CENTRE_Y_UNITS,
      radius:  CHASE_BUG_TICKET.DOT_RADIUS_UNITS,
      fill:    'alarm',
      opacity,
      transform,
    },
  ];
}

export const ChasePageShapeUtil = Object.freeze({ bugShapesOf, linkShapeOf, ticketShapesOf });
