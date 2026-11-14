/** Where Flint can stand: the habitat or home it lives in, and the stretch of that floor it fits on. */
import type { Facing }                                 from '../../SpriteGeometry.ts';
import { BODY_SHAPE }                                  from '../../constants/BodyShape.ts';
import type { SpriteMindState }                        from '../MindState.ts';
import type { PerceivedHabitat, Perception, PlaceBox } from '../Perception.ts';

export interface StandingRange {
  readonly lowestX:  number;
  readonly highestX: number;
}

const HALF_BODY_WIDTH_UNITS = BODY_SHAPE.WIDTH_UNITS / 2;

function standingRangeOf(box: PlaceBox): StandingRange {
  const lowestX = box.leftX + HALF_BODY_WIDTH_UNITS;
  const highestX = box.rightX - HALF_BODY_WIDTH_UNITS;
  if (lowestX <= highestX) return { lowestX, highestX };
  const middleX = (box.leftX + box.rightX) / 2;
  return { lowestX: middleX, highestX: middleX };
}

function habitatById(perception: Perception, habitatId: string | null): PerceivedHabitat | null {
  if (habitatId === null) return null;
  return perception.habitats.find((habitat) => habitat.id === habitatId) ?? null;
}

export const PlaceUtil = Object.freeze({
  standingRangeOf,
  habitatById,

  /** The x held on the floor, half a body inside each end; a floor narrower than Flint holds it in the middle. */
  clampedToFloor: (positionX: number, box: PlaceBox): number => {
    const range = standingRangeOf(box);
    return Math.min(range.highestX, Math.max(range.lowestX, positionX));
  },

  middleOf: (box: PlaceBox): number => (box.leftX + box.rightX) / 2,

  /** The box of the habitat Flint lives in, or of its home; null when that place is not on the page. */
  boxWhereFlintLives: (state: SpriteMindState, perception: Perception): PlaceBox | null => {
    if (state.livesIn === null) return perception.home;
    return habitatById(perception, state.livesIn)?.box ?? null;
  },

  edgeXOf: (box: PlaceBox, edgeSide: Facing): number => (edgeSide === 1 ? box.rightX : box.leftX),

  isInside: (box: PlaceBox, pointX: number, pointY: number): boolean => pointX >= box.leftX && pointX <= box.rightX && pointY >= box.topY && pointY <= box.floorY,
});
