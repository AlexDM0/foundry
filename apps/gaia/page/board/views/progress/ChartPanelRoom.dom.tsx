/**
 * `useChartPanelRoom` on a chart whose sizes and scroll a spec sets, under a clock the spec fires by hand. What matters: closing the panel
 * glides the chart back and keeps the room until the glide ends at the natural end; a glide User's own scroll cut short, whose scrollend
 * lands past the natural end, still lets the room go once the release time passes, and a panel opened again before that keeps its room.
 */
import { act, cleanup, render } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';
import { useRef } from 'react';

import { BoardClockContext, type BoardClock } from '../../shell/BoardClock.ts';
import type { CoveringPanelWidthProperty }    from '../../shell/CoveringPanel.ts';
import { useChartPanelRoom }                  from './ChartPanelRoom.ts';

afterEach(cleanup);

const CHART_CLIENT_WIDTH_PIXELS = 400;
const CHART_SCROLL_WIDTH_PIXELS = 2000;
/** Past the natural end the room adds, where the open panel left the chart. */
const SCROLLED_INTO_ROOM_PIXELS = 1900;

interface HandFiredClock {
  readonly clock:        BoardClock;
  readonly firePending:  () => void;
  readonly pendingCount: () => number;
}

function handFiredClock(): HandFiredClock {
  const pending = new Set<() => void>();
  return {
    clock: {
      now:         () => new Date('2026-11-15T12:00:00Z'),
      everySecond: () => () => undefined,
      after:       (_milliseconds, callback) => {
        pending.add(callback);
        return () => pending.delete(callback);
      },
    },
    firePending: () => {
      const callbacks = [...pending];
      pending.clear();
      act(() => callbacks.forEach((callback) => callback()));
    },
    pendingCount: () => pending.size,
  };
}

/** Gives the chart the sizes and the scroll a laid-out, smooth-scrolling chart has; its glide does nothing until the spec ends it. */
function laidOut(chart: HTMLElement): void {
  let scrollLeft = 0;
  Object.defineProperty(chart, 'clientWidth', { configurable: true, get: () => CHART_CLIENT_WIDTH_PIXELS });
  Object.defineProperty(chart, 'scrollWidth', { configurable: true, get: () => CHART_SCROLL_WIDTH_PIXELS });
  Object.defineProperty(chart, 'scrollLeft', {
    configurable: true,
    get:          () => scrollLeft,
    set:          (value: number) => {
      scrollLeft = value;
    },
  });
  Object.defineProperty(chart, 'onscrollend', { configurable: true, value: null, writable: true });
  chart.scrollTo = () => undefined;
}

function Chart({ coveringWidthProperty }: { readonly coveringWidthProperty: CoveringPanelWidthProperty | null }) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  useChartPanelRoom(chartRef, null, coveringWidthProperty);
  return (
    <div
      className="example-chart"
      ref={(chart) => {
        if (chart !== null && !Object.hasOwn(chart, 'scrollLeft')) laidOut(chart);
        chartRef.current = chart;
      }}
    />
  );
}

function chartElement(): HTMLElement {
  const chart = document.querySelector<HTMLElement>('.example-chart');
  if (chart === null) throw new Error('no chart');
  return chart;
}

function renderChart(clock: BoardClock) {
  const view = (coveringWidthProperty: CoveringPanelWidthProperty | null) => (
    <BoardClockContext.Provider value={clock}>
      <Chart coveringWidthProperty={coveringWidthProperty} />
    </BoardClockContext.Provider>
  );
  const { rerender } = render(view('--side-panel-width'));
  return { show: (coveringWidthProperty: CoveringPanelWidthProperty | null) => rerender(view(coveringWidthProperty)) };
}

function openPanelThenScrollIntoRoom(clock: BoardClock) {
  const { show } = renderChart(clock);
  expect(chartElement().hasAttribute('data-panel-room')).toBe(true);
  chartElement().style.setProperty('--panel-room', '320px');
  chartElement().scrollLeft = SCROLLED_INTO_ROOM_PIXELS;
  return show;
}

describe('the room on close', () => {
  test('stays through the glide and goes at the scrollend at the natural end', () => {
    const { clock } = handFiredClock();
    const show = openPanelThenScrollIntoRoom(clock);
    show(null);
    expect(chartElement().hasAttribute('data-panel-room')).toBe(true);
    chartElement().scrollLeft = CHART_SCROLL_WIDTH_PIXELS - 320 - CHART_CLIENT_WIDTH_PIXELS;
    act(() => {
      chartElement().dispatchEvent(new Event('scrollend'));
    });
    expect(chartElement().hasAttribute('data-panel-room')).toBe(false);
  });

  test('goes once the release time passes when User\'s own scroll cut the glide short past the natural end', () => {
    const { clock, firePending } = handFiredClock();
    const show = openPanelThenScrollIntoRoom(clock);
    show(null);
    act(() => {
      chartElement().dispatchEvent(new Event('scrollend'));
    });
    expect(chartElement().hasAttribute('data-panel-room')).toBe(true);
    firePending();
    expect(chartElement().hasAttribute('data-panel-room')).toBe(false);
    expect(chartElement().style.getPropertyValue('--frozen-timeline-w')).toBe('');
  });

  test('a panel opened again before the release time keeps its room', () => {
    const { clock, pendingCount } = handFiredClock();
    const show = openPanelThenScrollIntoRoom(clock);
    show(null);
    expect(pendingCount()).toBe(1);
    show('--side-panel-width');
    expect(pendingCount()).toBe(0);
    expect(chartElement().hasAttribute('data-panel-room')).toBe(true);
  });
});
