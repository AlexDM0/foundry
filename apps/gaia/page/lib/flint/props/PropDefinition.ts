/**
 * The contract of a prop (`07-animation-modules.md`, rule 2): pure data and pure functions. A gesture gives a prop's state in its part of
 * the pose; the easing step moves the drawn state towards it; the renderer asks `shapesOf` for the shapes of the drawn state and writes
 * them. A prop makes no element itself.
 */
import type { Facing, Point }               from '../SpriteGeometry.ts';
import type { Drawing, GradientDefinition } from '../drawing/Shape.ts';

/** Every prop state has `shown`: its eased level, from 0 hidden to 1 shown. The renderer draws nothing at 0. */
export interface PropState {
  readonly shown: number;
}

/** Behind the body (after the far hand), in front of the body (behind the near hand), or in front of all but the marks. */
export type PropLayer = 'behind-body' | 'in-front-of-body' | 'in-front-of-all';

/** The drawn hand whose placement holds it to this prop, as a structural part of a hand; null when no hand holds it. */
export interface HoldingHand {
  readonly centreX: number;
  readonly centreY: number;
  readonly radius:  number;
}

export interface PropDrawingContext {
  readonly facing:      Facing;
  readonly holdingHand: HoldingHand | null;
}

export interface PropDefinition<Name extends string = string, State extends PropState = PropState> {
  readonly name:       Name;
  /** The state before the prop first shows, and the parameters it fades in from. */
  readonly hidden:     State;
  readonly layer:      PropLayer;
  /** The gradients its shapes fill with, by id. */
  readonly gradients?: readonly GradientDefinition[];
  /**
   * Its own easing, from the drawn state towards the target, given the share of the distance one frame covers at the hand rate. Without
   * one, only `shown` eases, and a prop the target hides keeps its last drawn state while it fades (`flint/props/PropEasingUtil.ts`).
   */
  easedOf?(drawn: State, target: State, handFraction: number): State;
  /** The point a hand held to this prop is set to on every frame, in sprite units; without one, no hand can be held to it. */
  gripOf?(state: State): Point;
  shapesOf(state: State, context: PropDrawingContext): Drawing;
}

/** Keeps the literal name and the state type of a prop definition, so the prop catalog can derive the pose type from it. */
export function propDefinition<const Name extends string, State extends PropState>(definition: PropDefinition<Name, State>): PropDefinition<Name, State> {
  return Object.freeze(definition);
}
