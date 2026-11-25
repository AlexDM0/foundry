/**
 * Where Flint stands in a box that keeps it inside, from the extents its gestures, emotes and attendants declare: at rest, far enough from
 * each wall that its attendants stay in, whichever way it walks; while it plays a gesture or an emote, where all it draws fits, turned
 * whichever way stands it nearer to where it wants to be.
 */
import { emoteDefinitionOf, intendedGestureOf } from '../../IntentMeaning.ts';
import type { DrawnExtent, Facing }             from '../../SpriteGeometry.ts';
import { ATTENDANT_CATALOG }                    from '../../attendants/AttendantCatalog.ts';
import { BODY_SHAPE }                           from '../../constants/BodyShape.ts';
import type { GestureIntent }                   from '../../gestures/GestureCatalog.ts';
import type { SpriteMindState }                 from '../MindState.ts';
import type { PlaceBox }                        from '../Perception.ts';
import type { StandingRange }                   from './PlaceUtil.ts';

export interface Stance {
  readonly standX: number;
  readonly facing: Facing;
}

const HALF_BODY_WIDTH_UNITS = BODY_SHAPE.WIDTH_UNITS / 2;

function unionOf(first: DrawnExtent, second: DrawnExtent): DrawnExtent {
  return {
    backUnits:       Math.max(first.backUnits, second.backUnits),
    frontUnits:      Math.max(first.frontUnits, second.frontUnits),
    aboveFloorUnits: Math.max(first.aboveFloorUnits, second.aboveFloorUnits),
    belowFloorUnits: Math.max(first.belowFloorUnits, second.belowFloorUnits),
  };
}

function unionOfAll(extents: readonly (DrawnExtent | null)[]): DrawnExtent | null {
  return extents.reduce<DrawnExtent | null>((union, extent) => (extent === null ? union : union === null ? extent : unionOf(union, extent)), null);
}

/** What the attendants with Flint now draw; null with none. */
function attendedExtentOf(state: SpriteMindState): DrawnExtent | null {
  const attended = ATTENDANT_CATALOG.filter((definition) => state.attendants.some((presence) => presence.name === definition.name));
  return unionOfAll(attended.map((definition) => definition.extent));
}

function emoteExtentOf(state: SpriteMindState): DrawnExtent | null {
  return state.emote === null ? null : emoteDefinitionOf(state.emote.name).extent;
}

/** What Flint draws while it plays this gesture intent, with its emote and its attendants. */
function extentWithGestureOf(state: SpriteMindState, gestureIntent: GestureIntent): DrawnExtent {
  const gestureExtent = intendedGestureOf(gestureIntent).form.extent;
  return unionOfAll([gestureExtent, emoteExtentOf(state), attendedExtentOf(state)]) ?? gestureExtent;
}

/** What Flint draws with the gesture, the emote and the attendants it has now; null while it plays neither a gesture nor an emote. */
function playingExtentOf(state: SpriteMindState): DrawnExtent | null {
  if (state.gesture !== null) return extentWithGestureOf(state, state.gesture.intent);
  const emoteExtent = emoteExtentOf(state);
  return emoteExtent === null ? null : unionOfAll([emoteExtent, attendedExtentOf(state)]);
}

/** The floor at rest: its attendants' reach from each wall, at least half the body, since Flint turns as it walks. */
function restingRangeOf(box: PlaceBox, state: SpriteMindState): StandingRange {
  const attended = attendedExtentOf(state);
  const marginUnits = Math.max(HALF_BODY_WIDTH_UNITS, attended?.backUnits ?? 0, attended?.frontUnits ?? 0);
  const lowestX = box.leftX + marginUnits;
  const highestX = box.rightX - marginUnits;
  if (lowestX <= highestX) return { lowestX, highestX };
  const middleX = (box.leftX + box.rightX) / 2;
  return { lowestX: middleX, highestX: middleX };
}

/** The x nearest the target where the extent fits facing this way; in a box too narrow for it, the middle of the two ends. */
function fittingStandXOf(box: PlaceBox, extent: DrawnExtent, facing: Facing, targetX: number): number {
  const lowestX = box.leftX + (facing === 1 ? extent.backUnits : extent.frontUnits);
  const highestX = box.rightX - (facing === 1 ? extent.frontUnits : extent.backUnits);
  if (lowestX > highestX) return (lowestX + highestX) / 2;
  return Math.min(highestX, Math.max(lowestX, targetX));
}

/**
 * Where the extent fits nearer the target, and the facing it fits in there; on a tie, the one nearer to where Flint stands, so a walk
 * there, which turns Flint, keeps the choice; then the current facing.
 */
function stanceOf(box: PlaceBox, extent: DrawnExtent, current: { readonly positionX: number; readonly facing: Facing }, targetX: number): Stance {
  const otherFacing: Facing = current.facing === 1 ? -1 : 1;
  const kept = { standX: fittingStandXOf(box, extent, current.facing, targetX), facing: current.facing };
  const turned = { standX: fittingStandXOf(box, extent, otherFacing, targetX), facing: otherFacing };
  const costOf = (stance: Stance): readonly [number, number] => [Math.abs(stance.standX - targetX), Math.abs(stance.standX - current.positionX)];
  const [keptToTarget, keptToFlint] = costOf(kept);
  const [turnedToTarget, turnedToFlint] = costOf(turned);
  const turnedIsNearer = turnedToTarget < keptToTarget || (turnedToTarget === keptToTarget && turnedToFlint < keptToFlint);
  return turnedIsNearer ? turned : kept;
}

export const StanceUtil = Object.freeze({
  extentWithGestureOf, playingExtentOf, restingRangeOf, stanceOf,
});
