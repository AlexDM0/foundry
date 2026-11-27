/**
 * Where Flint stands in a box that keeps it inside: its margin at rest, where a gesture's extent fits nearest the target and in which
 * facing, how a tie keeps the nearer stance, how a too-narrow box centres the overflow, and what an extent includes.
 */
import { describe, expect, test } from 'bun:test';

import { intendedGestureOf }       from '../../IntentMeaning.ts';
import { INITIAL_MIND_STATE }      from '../../SpriteMind.ts';
import { rosterAttended }          from '../../attendants/AttendantRoster.ts';
import { WATCHER_SPARK_ATTENDANT } from '../../attendants/watcher-spark/WatcherSparkAttendant.ts';
import { withEmote, withGesture }  from '../MindTransitions.ts';
import { StanceUtil }              from './StanceUtil.ts';

const STRIP_SLOT = {
  leftX: 0, rightX: 80, topY: 0, floorY: 66,
};

const EXTENT = {
  backUnits: 20, frontUnits: 50, aboveFloorUnits: 60, belowFloorUnits: -3,
};

const sparked = { ...INITIAL_MIND_STATE, attendants: rosterAttended(INITIAL_MIND_STATE.attendants, 'watcher-spark', 4, 0) };

describe('at rest', () => {
  test('Flint keeps half a body from each wall', () => {
    expect(StanceUtil.restingRangeOf(STRIP_SLOT, INITIAL_MIND_STATE)).toEqual({ lowestX: 20, highestX: 60 });
  });

  test('with attendants it keeps their reach from each wall, as it may face either way', () => {
    const reachUnits = WATCHER_SPARK_ATTENDANT.extent.backUnits;
    expect(StanceUtil.restingRangeOf(STRIP_SLOT, sparked)).toEqual({ lowestX: reachUnits, highestX: 80 - reachUnits });
  });
});

describe('with a gesture', () => {
  test('the extent fits nearest the target in the facing that stands it nearer', () => {
    expect(StanceUtil.stanceOf(STRIP_SLOT, EXTENT, { positionX: 25, facing: 1 }, 25)).toEqual({ standX: 25, facing: 1 });
    expect(StanceUtil.stanceOf(STRIP_SLOT, EXTENT, { positionX: 58, facing: 1 }, 58)).toEqual({ standX: 58, facing: -1 });
  });

  test('on a tie the stance nearer to Flint wins, whatever way it faces now', () => {
    expect(StanceUtil.stanceOf(STRIP_SLOT, EXTENT, { positionX: 39, facing: -1 }, 40)).toEqual({ standX: 30, facing: 1 });
    expect(StanceUtil.stanceOf(STRIP_SLOT, EXTENT, { positionX: 41, facing: 1 }, 40)).toEqual({ standX: 50, facing: -1 });
  });

  test('a box too narrow for the extent splits the overflow between its walls', () => {
    const wide = { ...EXTENT, frontUnits: 70 };
    expect(StanceUtil.stanceOf(STRIP_SLOT, wide, { positionX: 40, facing: 1 }, 40)).toEqual({ standX: 15, facing: 1 });
  });

  test('the extent of a gesture adds its emote and its attendants', () => {
    const asking = withEmote(withGesture(sparked, 'ask', 0), 'thinking', 0);
    const askExtent = intendedGestureOf('ask').form.extent;
    expect(StanceUtil.playingExtentOf(asking)).toMatchObject({
      backUnits:  Math.max(askExtent.backUnits, WATCHER_SPARK_ATTENDANT.extent.backUnits),
      frontUnits: askExtent.frontUnits,
    });
    expect(StanceUtil.playingExtentOf(sparked)).toBeNull();
  });
});
