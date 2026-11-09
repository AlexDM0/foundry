/**
 * The chart's room beside the detail panel. The cases that matter: the panel is never wider than the viewport; the room is what the panel
 * covers plus the gutter, and none when it covers nothing; the natural end leaves the room out; a bar past the panel scrolls its end clear,
 * a bar left of the pinned column scrolls its start in, and a bar wider than the track keeps its end in view.
 */
import { describe, expect, test } from 'bun:test';

import { PANEL_GUTTER_PIXELS } from '../constants/ProgressChart.ts';
import { PanelRoomUtil }       from './PanelRoomUtil.ts';

describe('panelLeftEdgeOf', () => {
  test('starts the panel its width from the right edge, at the left edge on a narrower viewport', () => {
    expect(PanelRoomUtil.panelLeftEdgeOf(1600, 480)).toBe(1120);
    expect(PanelRoomUtil.panelLeftEdgeOf(390, 480)).toBe(0);
  });
});

describe('roomPixelsOf', () => {
  test('makes room for what the panel covers plus the gutter', () => {
    expect(PanelRoomUtil.roomPixelsOf(1559, 1120)).toBe(439 + PANEL_GUTTER_PIXELS);
  });

  test('makes no room when the panel covers nothing of the chart', () => {
    expect(PanelRoomUtil.roomPixelsOf(1000, 1120)).toBe(0);
  });
});

describe('naturalScrollEndOf', () => {
  test('ends the scroll range where it ended before the room, never before the start', () => {
    expect(PanelRoomUtil.naturalScrollEndOf(1973, 455, 1518)).toBe(0);
    expect(PanelRoomUtil.naturalScrollEndOf(2400, 455, 1518)).toBe(427);
  });
});

describe('barsClearingOffsetOf', () => {
  test('scrolls a bar running under the panel until its end clears it', () => {
    expect(PanelRoomUtil.barsClearingOffsetOf({
      barsLeft: 600, barsRight: 1528, trackLeft: 489, trackRight: 1104
    })).toBe(424);
  });

  test('leaves a bar that already shows where it is', () => {
    expect(PanelRoomUtil.barsClearingOffsetOf({
      barsLeft: 600, barsRight: 900, trackLeft: 489, trackRight: 1104
    })).toBe(0);
  });

  test('scrolls a bar behind the pinned column back in, and keeps the end of a bar wider than the track', () => {
    expect(PanelRoomUtil.barsClearingOffsetOf({
      barsLeft: 300, barsRight: 700, trackLeft: 489, trackRight: 1104
    })).toBe(-189);
    expect(PanelRoomUtil.barsClearingOffsetOf({
      barsLeft: 100, barsRight: 2000, trackLeft: 489, trackRight: 1104
    })).toBe(896);
  });
});
