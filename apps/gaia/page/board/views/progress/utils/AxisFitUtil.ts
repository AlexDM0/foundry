/**
 * How many pixels the Progress chart's axis needs for its tick labels, whether a tick or now label near the right edge must sit left of its
 * line, and where the chart scrolls to bring now into view.
 */
import type { TimelineTick }                               from '../../../@types/Timeline.ts';
import { NOW_LABEL_ROOM_PIXELS, TICK_LABEL_GUTTER_PIXELS } from '../constants/ProgressChart.ts';

const TICK_MINIMUM_PIXELS             = 60;
const TICK_PIXELS_PER_LABEL_CHARACTER = 9;

function axisPixelsNeededFor(ticks: readonly TimelineTick[]): number {
  const longestLabel  = ticks.reduce((longest, tick) => Math.max(longest, tick.label.length), 0);
  const perTickPixels = Math.max(TICK_MINIMUM_PIXELS, longestLabel * TICK_PIXELS_PER_LABEL_CHARACTER);
  return ticks.length * perTickPixels;
}

function labelSitsLeftOfItsLine(tick: TimelineTick, axisWidthPixels: number): boolean {
  const remainingPixels = axisWidthPixels * (100 - tick.leftPercent) / 100;
  return remainingPixels < tick.label.length * TICK_PIXELS_PER_LABEL_CHARACTER + TICK_LABEL_GUTTER_PIXELS;
}

function nowLabelSitsLeftOfMarker(nowPercent: number, axisWidthPixels: number): boolean {
  return axisWidthPixels * (100 - nowPercent) / 100 < NOW_LABEL_ROOM_PIXELS;
}

/** What the chart measured as laid out: its scroll box, the pinned name column over its left edge, and the axis width. */
export interface ChartScrollMeasures {
  readonly clientWidthPixels: number;
  readonly scrollWidthPixels: number;
  readonly pinnedWidthPixels: number;
  readonly axisWidthPixels:   number;
}

/** The scroll offset that centres now in the part of the chart the pinned column leaves visible, held inside the scroll range. */
function nowScrollLeftOf(nowPercent: number, measures: ChartScrollMeasures): number {
  const visibleAxisWidth   = Math.max(1, measures.clientWidthPixels - measures.pinnedWidthPixels);
  const markerAxisOffset   = measures.axisWidthPixels * nowPercent / 100;
  const furthestScrollLeft = Math.max(0, measures.scrollWidthPixels - measures.clientWidthPixels);
  return Math.max(0, Math.min(markerAxisOffset - visibleAxisWidth / 2, furthestScrollLeft));
}

export const AxisFitUtil = Object.freeze({
  axisPixelsNeededFor, labelSitsLeftOfItsLine, nowLabelSitsLeftOfMarker, nowScrollLeftOf
});
