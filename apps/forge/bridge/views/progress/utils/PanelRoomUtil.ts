/** The room the Progress chart makes beside the open detail panel, in pixels: how much trailing scroll room, and how far to scroll a bar clear. */
import { PANEL_GUTTER_PIXELS } from '../constants/ProgressChart.ts';

/** Where the panel starts: it is as wide as its token, never wider than the viewport. */
function panelLeftEdgeOf(viewportWidthPixels: number, panelWidthPixels: number): number {
  return viewportWidthPixels - Math.min(panelWidthPixels, viewportWidthPixels);
}

/** The width the panel covers of the chart, plus the gutter, or none when the panel covers nothing of it. */
function roomPixelsOf(chartVisibleRightEdge: number, panelLeftEdge: number): number {
  const coveredPixels = Math.max(0, chartVisibleRightEdge - panelLeftEdge);
  return coveredPixels > 0 ? coveredPixels + PANEL_GUTTER_PIXELS : 0;
}

/** The scroll offset where the chart ends without its room, so it can glide back there before the room goes. */
function naturalScrollEndOf(scrollWidthPixels: number, roomPixels: number, clientWidthPixels: number): number {
  return Math.max(0, scrollWidthPixels - roomPixels - clientWidthPixels);
}

/** The horizontal span of a row's bars, and the part of the track the pinned column and the panel leave visible. */
export interface BarsInTrack {
  readonly barsLeft:   number;
  readonly barsRight:  number;
  readonly trackLeft:  number;
  readonly trackRight: number;
}

/** How far to scroll so the bars' end, the latest part of the work, shows left of the panel; a bar wider than the track keeps its end. */
function barsClearingOffsetOf(bars: BarsInTrack): number {
  if (bars.barsLeft < bars.trackLeft) return Math.max(bars.barsLeft - bars.trackLeft, bars.barsRight - bars.trackRight);
  return Math.max(0, bars.barsRight - bars.trackRight);
}

export const PanelRoomUtil = Object.freeze({
  panelLeftEdgeOf, roomPixelsOf, naturalScrollEndOf, barsClearingOffsetOf
});
