/**
 * The arithmetic of the room the detail panel makes beside it: how much of a scroller the panel covers, the trailing room that becomes,
 * where a scroller's own end lies without it, and how far the chart scrolls to bring an opened row's bar clear of the panel. Positions
 * are viewport pixels.
 */

/** Kept between the panel's edge and what it opened on, and between the chart's pinned column and a bar scrolled clear. */
export const PANEL_GUTTER_PIXELS = 16;

/** The panel's left edge: the viewport less the panel's width, which never exceeds the viewport. */
function panelLeftEdgeOf(viewportWidth: number, detailWidth: number): number {
  return viewportWidth - Math.min(detailWidth, viewportWidth);
}

function coveredWidthOf(scrollerVisibleRightEdge: number, panelLeftEdge: number): number {
  return Math.max(0, scrollerVisibleRightEdge - panelLeftEdge);
}

/** A scroller the panel covers gains what it covers plus a gutter; one it does not cover gains nothing. */
function panelRoomOf(coveredWidth: number): number {
  return coveredWidth > 0 ? coveredWidth + PANEL_GUTTER_PIXELS : 0;
}

/** Where the scroller's content ends without the room, the scroll position a release glides back to. */
function naturalEndOf(scrollWidth: number, panelRoom: number, clientWidth: number): number {
  return Math.max(0, scrollWidth - panelRoom - clientWidth);
}

export interface BarSpan {
  readonly barLeft:    number;
  readonly barRight:   number;
  /** The pinned column's right edge plus the gutter. */
  readonly trackLeft:  number;
  /** The nearer of the chart's visible right edge and the panel's left edge, less the gutter. */
  readonly trackRight: number;
}

/** How far the chart scrolls; a bar longer than the track left of the panel keeps its end in view, the latest part of the work. */
function barScrollOffsetOf({
  barLeft, barRight, trackLeft, trackRight
}: BarSpan): number {
  const endOffset = barRight > trackRight ? barRight - trackRight : 0;
  return barLeft < trackLeft ? Math.max(barLeft - trackLeft, barRight - trackRight) : endOffset;
}

export const PanelRoomModel = Object.freeze({
  panelLeftEdgeOf,
  coveredWidthOf,
  panelRoomOf,
  naturalEndOf,
  barScrollOffsetOf,
});
