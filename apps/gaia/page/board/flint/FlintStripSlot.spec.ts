/**
 * All that Flint plays in a strip's slot fits the slot. What matters: every intent a strip's habitat answers (its arrival included) and
 * every board occasion, which Flint plays wherever it is, declares an extent that fits the 60 by 50 pixel box at Gaia's size, with the
 * Watcher sparks at their most beside it: no wider than the box, as the library stands Flint where it fits, no higher, and nothing below
 * the floor; and at rest the sparks fit too. The library holds each declared extent to what it draws, and what Flint draws with the
 * sparks in a box of this size, a hop that lifts them included (`lib/flint/mind/utils/StanceUtil.fit.spec.ts`).
 */
import { describe, expect, test } from 'bun:test';

import {
  attendantExtentOf,
  intentExtentOf,
  type DrawnExtent,
  type SpriteIntent
} from '../../lib/flint/FlintInterface.ts';
import { BOARD_OCCASION_INTENTS, WATCHER_SPARK_ATTENDANT }                              from './BoardOccasionModel.ts';
import { BOARD_FLINT_PIXELS_FOR_ONE_UNIT, STRIP_FLINT_SLOT, STRIP_FLINT_SLOT_HABITATS } from './FlintStripSlot.ts';

/** Flint at rest, the top of its hover's swing included: what a behaviour such as the wander draws. */
const BODY_AT_REST: DrawnExtent = {
  backUnits: 20, frontUnits: 20, aboveFloorUnits: 59, belowFloorUnits: -3,
};

function sparksExtentOf(): DrawnExtent {
  const extent = attendantExtentOf(WATCHER_SPARK_ATTENDANT);
  if (extent === null) throw new Error('the Watcher sparks declare no extent');
  return extent;
}

const SPARKS = sparksExtentOf();

const STRIP_INTENTS = [...new Set<SpriteIntent>([
  ...STRIP_FLINT_SLOT_HABITATS.flatMap((habitat) => habitat.suggestions.map((suggestion) => suggestion.respond)),
  ...Object.values(BOARD_OCCASION_INTENTS),
])];

/** The pixels by which the extent, with the sparks beside it, leaves the box on each side; all 0 when it fits. */
function overflowPixelsOf(extent: DrawnExtent): Readonly<Record<'width' | 'top' | 'floor', number>> {
  const widthUnits = Math.max(extent.backUnits, SPARKS.backUnits) + Math.max(extent.frontUnits, SPARKS.frontUnits);
  const aboveUnits = Math.max(extent.aboveFloorUnits, SPARKS.aboveFloorUnits);
  const pixelsOf = (units: number): number => Math.max(0, units * BOARD_FLINT_PIXELS_FOR_ONE_UNIT);
  return {
    width: pixelsOf(widthUnits - (STRIP_FLINT_SLOT.WIDTH_PIXELS / BOARD_FLINT_PIXELS_FOR_ONE_UNIT)),
    top:   pixelsOf(aboveUnits - (STRIP_FLINT_SLOT.HEIGHT_PIXELS / BOARD_FLINT_PIXELS_FOR_ONE_UNIT)),
    floor: pixelsOf(extent.belowFloorUnits),
  };
}

describe('a strip\'s slot of 60 by 50 pixels', () => {
  test('the strips answer the work, the questions and the arrival, and the board its occasions', () => {
    expect(STRIP_INTENTS).toEqual(expect.arrayContaining(['wave', 'thinking', 'research', 'type', 'ask', 'happy', 'wander', 'intercept', 'bank-fire']));
  });

  test.each(STRIP_INTENTS)('%s fits with the sparks beside it', (intent) => {
    expect(overflowPixelsOf(intentExtentOf(intent) ?? BODY_AT_REST)).toEqual({ width: 0, top: 0, floor: 0 });
  });

  test('at rest the sparks fit, whichever way Flint faces', () => {
    const sparkReachPixels = Math.max(SPARKS.backUnits, SPARKS.frontUnits) * BOARD_FLINT_PIXELS_FOR_ONE_UNIT;
    expect(2 * sparkReachPixels).toBeLessThanOrEqual(STRIP_FLINT_SLOT.WIDTH_PIXELS);
    expect(overflowPixelsOf(BODY_AT_REST)).toEqual({ width: 0, top: 0, floor: 0 });
  });
});
