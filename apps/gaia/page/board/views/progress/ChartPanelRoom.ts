/**
 * Keeps the Progress chart usable beside a right-edge panel: while the detail panel or the question panel is open the chart gains trailing
 * scroll room the width the panel covers, with its timeline width frozen so no bar moves, and the opened row's bars scroll clear of the
 * panel. On close the chart glides back to its own end before the room goes, so nothing it shows jumps; a glide User's own scroll cut
 * short still lets the room go after `PANEL_ROOM_RELEASE_MILLISECONDS`.
 */
import { useLayoutEffect, type RefObject } from 'react';

import { useBoardClock, type BoardClock }  from '../../shell/BoardClock.ts';
import type { CoveringPanelWidthProperty } from '../../shell/CoveringPanel.ts';
import type { DetailItem }                 from '../../shell/DetailRoute.ts';
import { PANEL_GUTTER_PIXELS }             from './constants/ProgressChart.ts';
import { PanelRoomUtil }                   from './utils/PanelRoomUtil.ts';

const PANEL_ROOM_ATTRIBUTE           = 'data-panel-room';
const PANEL_ROOM_PROPERTY            = '--panel-room';
const FROZEN_TIMELINE_WIDTH_PROPERTY = '--frozen-timeline-w';
const HEAD_TRACK_SELECTOR            = '.board-progress-chart-head > .board-progress-track';
const HEAD_NAME_SELECTOR             = '.board-progress-chart-head > .board-progress-name';
/** A scroll position within this of the natural end counts as there: scroll offsets are fractional. */
const SCROLL_END_TOLERANCE_PIXELS    = 1;
/** The longest a glide back may hold the room before it goes anyway. */
const PANEL_ROOM_RELEASE_MILLISECONDS = 1000;

function pixelsOf(text: string): number {
  return Number.parseFloat(text) || 0;
}

function panelLeftEdge(widthProperty: CoveringPanelWidthProperty): number {
  const viewportWidth = document.documentElement.clientWidth;
  return PanelRoomUtil.panelLeftEdgeOf(viewportWidth, pixelsOf(getComputedStyle(document.documentElement).getPropertyValue(widthProperty)));
}

function visibleRightEdgeOf(chart: HTMLElement): number {
  return chart.getBoundingClientRect().left + chart.clientLeft + chart.clientWidth;
}

function motionIsReduced(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function makeRoom(chart: HTMLElement, widthProperty: CoveringPanelWidthProperty): void {
  if (chart.clientWidth === 0) return;
  if (!chart.hasAttribute(PANEL_ROOM_ATTRIBUTE)) {
    const timeline = chart.querySelector(HEAD_TRACK_SELECTOR);
    if (timeline !== null) chart.style.setProperty(FROZEN_TIMELINE_WIDTH_PROPERTY, `${timeline.getBoundingClientRect().width}px`);
  }
  chart.style.setProperty(PANEL_ROOM_PROPERTY, `${PanelRoomUtil.roomPixelsOf(visibleRightEdgeOf(chart), panelLeftEdge(widthProperty))}px`);
  chart.setAttribute(PANEL_ROOM_ATTRIBUTE, '');
}

function dropRoom(chart: HTMLElement): void {
  chart.removeAttribute(PANEL_ROOM_ATTRIBUTE);
  chart.style.removeProperty(PANEL_ROOM_PROPERTY);
  chart.style.removeProperty(FROZEN_TIMELINE_WIDTH_PROPERTY);
}

/** Glides back to the natural end, then drops the room; answers what stops a glide still under way. */
function releaseRoom(chart: HTMLElement, clock: BoardClock): (() => void) | undefined {
  if (!chart.hasAttribute(PANEL_ROOM_ATTRIBUTE)) return undefined;
  const naturalEnd = PanelRoomUtil.naturalScrollEndOf(chart.scrollWidth, pixelsOf(chart.style.getPropertyValue(PANEL_ROOM_PROPERTY)), chart.clientWidth);
  const glideIsNeeded = chart.clientWidth > 0 && chart.scrollLeft > naturalEnd + SCROLL_END_TOLERANCE_PIXELS;
  if (!glideIsNeeded || motionIsReduced() || !('onscrollend' in chart)) {
    chart.scrollLeft = Math.min(chart.scrollLeft, naturalEnd);
    dropRoom(chart);
    return undefined;
  }
  // A scrollend left over from the opening scroll can arrive first, so only the one at the natural end counts.
  const dropAtNaturalEnd = (): void => {
    if (chart.scrollLeft > naturalEnd + SCROLL_END_TOLERANCE_PIXELS) return;
    chart.removeEventListener('scrollend', dropAtNaturalEnd);
    dropRoom(chart);
  };
  chart.addEventListener('scrollend', dropAtNaturalEnd);
  const cancelRelease = clock.after(PANEL_ROOM_RELEASE_MILLISECONDS, () => {
    chart.removeEventListener('scrollend', dropAtNaturalEnd);
    dropRoom(chart);
  });
  chart.scrollTo({ left: naturalEnd, behavior: 'smooth' });
  return () => {
    chart.removeEventListener('scrollend', dropAtNaturalEnd);
    cancelRelease();
  };
}

function scrollRowClearOfPanel(chart: HTMLElement, row: HTMLElement): void {
  // Only an opened row asks to scroll clear, and a row opens the detail panel.
  row.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  const bars = [...row.querySelectorAll('.board-progress-track > .board-progress-bar:not([hidden])')].map((bar) => bar.getBoundingClientRect());
  if (bars.length === 0) return;
  const pinnedColumn = chart.querySelector(HEAD_NAME_SELECTOR);
  const pinnedRightEdge = pinnedColumn === null ? chart.getBoundingClientRect().left : pinnedColumn.getBoundingClientRect().right;
  const offset = PanelRoomUtil.barsClearingOffsetOf({
    barsLeft:   Math.min(...bars.map((box) => box.left)),
    barsRight:  Math.max(...bars.map((box) => box.right)),
    trackLeft:  pinnedRightEdge + PANEL_GUTTER_PIXELS,
    trackRight: Math.min(visibleRightEdgeOf(chart), panelLeftEdge('--side-panel-width')) - PANEL_GUTTER_PIXELS,
  });
  if (offset !== 0) chart.scrollBy({ left: offset, behavior: motionIsReduced() ? 'auto' : 'smooth' });
}

export function useChartPanelRoom(chartRef: RefObject<HTMLElement | null>, openItem: DetailItem | null, coveringWidthProperty: CoveringPanelWidthProperty | null): void {
  const openTaskId = openItem?.form === 'task-row' ? openItem.taskId : null;
  const clock = useBoardClock();

  useLayoutEffect(() => {
    const chart = chartRef.current;
    if (chart === null) return undefined;
    if (coveringWidthProperty === null) return releaseRoom(chart, clock);
    makeRoom(chart, coveringWidthProperty);
    const remakeRoom = (): void => {
      dropRoom(chart);
      makeRoom(chart, coveringWidthProperty);
    };
    window.addEventListener('resize', remakeRoom);
    return () => window.removeEventListener('resize', remakeRoom);
  }, [chartRef, coveringWidthProperty, clock]);

  useLayoutEffect(() => {
    const chart = chartRef.current;
    const row = chart?.querySelector(`.board-progress-rows > .board-progress-row[data-task-id="${String(openTaskId)}"]`);
    if (chart === null || chart === undefined || openTaskId === null || !(row instanceof HTMLElement)) return;
    scrollRowClearOfPanel(chart, row);
  }, [chartRef, openTaskId]);
}
