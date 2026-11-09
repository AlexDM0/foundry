/**
 * The panel room's arithmetic. What matters: the panel never reaches past a narrow viewport's left edge; an uncovered scroller gains no
 * room and a covered one what is covered plus the gutter; the natural end never goes below zero; and a bar is scrolled only as far as it
 * must be, a bar longer than the track keeping its end in view.
 */
import { describe, expect, test } from 'bun:test';

import { PANEL_GUTTER_PIXELS, PanelRoomModel } from './PanelRoomModel.ts';

describe('PanelRoomModel', () => {
  test('puts the panel edge its width in from the viewport edge, and at zero on a viewport narrower than the panel', () => {
    expect(PanelRoomModel.panelLeftEdgeOf(1600, 480)).toBe(1120);
    expect(PanelRoomModel.panelLeftEdgeOf(390, 480)).toBe(0);
  });

  test('counts only the part of a scroller right of the panel edge as covered', () => {
    expect(PanelRoomModel.coveredWidthOf(1576, 1120)).toBe(456);
    expect(PanelRoomModel.coveredWidthOf(1000, 1120)).toBe(0);
  });

  test('gives a covered scroller its covered width plus the gutter, and an uncovered one no room', () => {
    expect(PanelRoomModel.panelRoomOf(440)).toBe(440 + PANEL_GUTTER_PIXELS);
    expect(PanelRoomModel.panelRoomOf(0)).toBe(0);
  });

  test('puts the natural end where the content ends without the room, never below zero', () => {
    expect(PanelRoomModel.naturalEndOf(1976, 456, 1520)).toBe(0);
    expect(PanelRoomModel.naturalEndOf(2400, 456, 1520)).toBe(424);
    expect(PanelRoomModel.naturalEndOf(1000, 456, 1520)).toBe(0);
  });

  test('leaves a bar that already sits between the pinned column and the panel where it is', () => {
    expect(PanelRoomModel.barScrollOffsetOf({
      barLeft: 700, barRight: 900, trackLeft: 600, trackRight: 1104
    })).toBe(0);
  });

  test('scrolls a bar under the panel left until its end clears the panel', () => {
    expect(PanelRoomModel.barScrollOffsetOf({
      barLeft: 1000, barRight: 1300, trackLeft: 600, trackRight: 1104
    })).toBe(196);
  });

  test('scrolls back to a bar hidden under the pinned column until its start shows', () => {
    expect(PanelRoomModel.barScrollOffsetOf({
      barLeft: 400, barRight: 500, trackLeft: 600, trackRight: 1104
    })).toBe(-200);
  });

  test('keeps the end of a bar longer than the track in view', () => {
    expect(PanelRoomModel.barScrollOffsetOf({
      barLeft: 300, barRight: 1500, trackLeft: 600, trackRight: 1104
    })).toBe(396);
  });
});
