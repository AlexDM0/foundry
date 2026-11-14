/**
 * What the sensors give the mind on one frame, as plain data in overlay units (pixels divided by the size of one unit). The mind reads
 * nothing else of the page: a habitat is its id, its kind and its box.
 */
import type { CueName, IntentName } from './MindState.ts';

/** A component's box; Flint's floor is its bottom edge, inside it. */
export interface PlaceBox {
  readonly leftX:  number;
  readonly rightX: number;
  readonly topY:   number;
  readonly floorY: number;
}

export interface PerceivedCopyTarget {
  readonly centreX: number;
  readonly intent:  IntentName;
}

export interface PerceivedHabitat {
  readonly id:         string;
  readonly kind:       string;
  readonly box:        PlaceBox;
  /** At least the minimum size on both sides; Flint never goes into a smaller habitat. */
  readonly isRoomy:    boolean;
  /** Read only for the habitat Flint lives in; null elsewhere. */
  readonly copyTarget: PerceivedCopyTarget | null;
}

export interface PerceivedPoint {
  readonly x: number;
  readonly y: number;
}

export interface PerceivedPointer {
  readonly x:        number;
  readonly y:        number;
  /** The pointer moved since the last frame. */
  readonly hasMoved: boolean;
}

export type PointerHappening =
  | { readonly kind: 'clicked' }
  | { readonly kind: 'drag-started' }
  /** The habitat below the pointer at the drop, when it is roomy; null is a drop on no habitat. */
  | { readonly kind: 'dropped'; readonly habitatId: string | null };

/** The host's element of an intent: none given, its box on this frame, or gone from the page since it was given. */
export type PerceivedTarget =
  | { readonly kind: 'none' }
  | { readonly kind: 'on-the-page'; readonly box: PlaceBox }
  | { readonly kind: 'gone' };

export const NO_TARGET: PerceivedTarget = Object.freeze({ kind: 'none' });

export interface PerceivedCue {
  readonly habitatId: string;
  readonly cue:       CueName;
}

export interface Perception {
  readonly home:            PlaceBox | null;
  readonly habitats:        readonly PerceivedHabitat[];
  /** Null while the pointer is outside the page. */
  readonly pointer:         PerceivedPointer | null;
  /** In the order they happened since the last frame. */
  readonly happenings:      readonly PointerHappening[];
  readonly cues:            readonly PerceivedCue[];
  /** The roomy habitat of the kind the host's storage remembers, while Flint may still move there; null otherwise. */
  readonly storedHabitatId: string | null;
  readonly stageWidthUnits: number;
  /** The element the host gave with its intent (`perform(intent, element)`), to a gesture that aims or to a behaviour. */
  readonly target:          PerceivedTarget;
  readonly reducedMotion:   boolean;
}

export interface FrameTime {
  readonly elapsedMilliseconds: number;
  readonly deltaMilliseconds:   number;
}
