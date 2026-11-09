/**
 * Keeps what the detail panel opened on in view beside it: while the panel is open, the Kanban lanes and the Progress chart gain trailing
 * scroll room the width of what the panel covers, with their lane and timeline widths frozen so nothing underneath reflows, and the
 * opened card or row scrolls clear of the panel. On close the scroller glides back to its own end before the room goes.
 */
import { useEffect, useRef } from 'react';

import { PANEL_GUTTER_PIXELS, PanelRoomModel } from './PanelRoomModel.ts';

const PANEL_ROOM_ATTRIBUTE = 'data-panel-room';
const PANEL_ROOM_PROPERTY = '--panel-room';
const PANEL_COVER_PROPERTY = '--panel-cover';
const DETAIL_WIDTH_PROPERTY = '--detail-w';
const SELECTED_SELECTOR = '[data-selected]';
const KANBAN_CARD_SELECTOR = '.bridge-kanban-card';
const PROGRESS_ROW_SELECTOR = '.bridge-progress-rows > .bridge-progress-row';
const PROGRESS_CHART_SELECTOR = '.bridge-progress-chart';
const PINNED_COLUMN_SELECTOR = ':scope > .bridge-progress-chart-head > .bridge-progress-name';
const ROW_BAR_SELECTOR = ':scope > .bridge-progress-track > .bridge-progress-bar:not([hidden])';
const SCROLL_SETTLE_FALLBACK_MILLISECONDS = 1000;

/** A scroller the panel makes room in, the part whose width it freezes, and the frame whose end fade follows the panel's edge. */
interface PanelRoomScroller {
  readonly scrollerSelector:    string;
  readonly frameSelector:       string | null;
  readonly frozenPartSelector:  string;
  readonly frozenWidthProperty: string;
}

const PANEL_ROOM_SCROLLERS: readonly PanelRoomScroller[] = [
  {
    scrollerSelector:    '.bridge-kanban-lanes',
    frameSelector:       '.bridge-kanban-frame',
    frozenPartSelector:  ':scope > .bridge-lane:not([data-collapsed])',
    frozenWidthProperty: '--frozen-lane-width',
  },
  {
    scrollerSelector:    PROGRESS_CHART_SELECTOR,
    frameSelector:       null,
    frozenPartSelector:  ':scope > .bridge-progress-chart-head > .bridge-progress-track',
    frozenWidthProperty: '--frozen-timeline-width',
  },
];

interface ShownScroller {
  readonly scroller: HTMLElement;
  readonly frame:    HTMLElement | null;
  readonly kind:     PanelRoomScroller;
}

function shownScrollers(): ShownScroller[] {
  return PANEL_ROOM_SCROLLERS.flatMap((kind) => [...document.querySelectorAll<HTMLElement>(kind.scrollerSelector)].map((scroller) => {
    const frame = kind.frameSelector === null ? null : scroller.closest<HTMLElement>(kind.frameSelector);
    return { scroller, frame, kind };
  }));
}

function pixelsOf(text: string): number {
  return Number.parseFloat(text) || 0;
}

function panelLeftEdge(): number {
  const detailWidth = pixelsOf(getComputedStyle(document.documentElement).getPropertyValue(DETAIL_WIDTH_PROPERTY));
  return PanelRoomModel.panelLeftEdgeOf(document.documentElement.clientWidth, detailWidth);
}

function visibleRightEdgeOf(scroller: HTMLElement): number {
  return scroller.getBoundingClientRect().left + scroller.clientLeft + scroller.clientWidth;
}

function scrollBehaviour(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

/** The Kanban measures its edge fades on its own scroll, and the room changed the board's width without one. */
function remeasureOverflow({ scroller, frame }: ShownScroller): void {
  if (frame !== null) scroller.dispatchEvent(new Event('scroll'));
}

function freezeWidth({ scroller, kind }: ShownScroller): void {
  const frozenPart = scroller.querySelector(kind.frozenPartSelector);
  if (frozenPart !== null) scroller.style.setProperty(kind.frozenWidthProperty, `${String(frozenPart.getBoundingClientRect().width)}px`);
}

function dropRoom(shown: ShownScroller): void {
  const { scroller, frame, kind } = shown;
  scroller.removeAttribute(PANEL_ROOM_ATTRIBUTE);
  scroller.style.removeProperty(PANEL_ROOM_PROPERTY);
  scroller.style.removeProperty(kind.frozenWidthProperty);
  frame?.style.removeProperty(PANEL_COVER_PROPERTY);
  remeasureOverflow(shown);
}

/** A scroller hidden by its view's layout keeps no room; it gets its room when the panel next opens or the window resizes. */
function makeRoom(): void {
  const panelEdge = panelLeftEdge();
  for (const shown of shownScrollers()) {
    const { scroller, frame } = shown;
    if (scroller.clientWidth === 0) continue;
    if (!scroller.hasAttribute(PANEL_ROOM_ATTRIBUTE)) freezeWidth(shown);
    const coveredWidth = PanelRoomModel.coveredWidthOf(visibleRightEdgeOf(scroller), panelEdge);
    scroller.style.setProperty(PANEL_ROOM_PROPERTY, `${String(PanelRoomModel.panelRoomOf(coveredWidth))}px`);
    scroller.setAttribute(PANEL_ROOM_ATTRIBUTE, '');
    frame?.style.setProperty(PANEL_COVER_PROPERTY, `${String(coveredWidth)}px`);
    remeasureOverflow(shown);
  }
}

function remakeRoom(): void {
  for (const shown of shownScrollers()) {
    if (shown.scroller.hasAttribute(PANEL_ROOM_ATTRIBUTE)) dropRoom(shown);
  }
  makeRoom();
}

function scrollBarClearOfPanel(chart: HTMLElement, row: HTMLElement): void {
  const bars = [...row.querySelectorAll(ROW_BAR_SELECTOR)].map((bar) => bar.getBoundingClientRect());
  if (bars.length === 0) return;
  const pinnedColumn = chart.querySelector(PINNED_COLUMN_SELECTOR);
  const pinnedColumnRightEdge = pinnedColumn === null ? chart.getBoundingClientRect().left : pinnedColumn.getBoundingClientRect().right;
  const offset = PanelRoomModel.barScrollOffsetOf({
    barLeft:    Math.min(...bars.map((box) => box.left)),
    barRight:   Math.max(...bars.map((box) => box.right)),
    trackLeft:  pinnedColumnRightEdge + PANEL_GUTTER_PIXELS,
    trackRight: Math.min(visibleRightEdgeOf(chart), panelLeftEdge()) - PANEL_GUTTER_PIXELS,
  });
  if (offset !== 0) chart.scrollBy({ left: offset, behavior: scrollBehaviour() });
}

function scrollClearOfPanel(opener: HTMLElement): void {
  if (opener.matches(KANBAN_CARD_SELECTOR)) {
    opener.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: scrollBehaviour() });
    return;
  }
  opener.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const chart = opener.matches(PROGRESS_ROW_SELECTOR) ? opener.closest<HTMLElement>(PROGRESS_CHART_SELECTOR) : null;
  if (chart !== null) scrollBarClearOfPanel(chart, opener);
}

/**
 * Glides each scroller with room back to its natural end, then drops the room, so nothing it shows jumps. Answers what cancels the
 * pending drops; a drop finds the panel open again and leaves the room.
 */
function releaseRoom(panelIsOpen: () => boolean): () => void {
  const cancellers: (() => void)[] = [];
  for (const shown of shownScrollers()) {
    const { scroller, frame } = shown;
    if (!scroller.hasAttribute(PANEL_ROOM_ATTRIBUTE)) continue;
    frame?.style.removeProperty(PANEL_COVER_PROPERTY);
    const naturalEnd = PanelRoomModel.naturalEndOf(scroller.scrollWidth, pixelsOf(scroller.style.getPropertyValue(PANEL_ROOM_PROPERTY)), scroller.clientWidth);
    const finish = (): void => {
      if (!panelIsOpen() && scroller.hasAttribute(PANEL_ROOM_ATTRIBUTE)) dropRoom(shown);
    };
    if (scroller.clientWidth === 0 || scroller.scrollLeft <= naturalEnd + 1 || scrollBehaviour() === 'auto') {
      scroller.scrollLeft = Math.min(scroller.scrollLeft, naturalEnd);
      finish();
      continue;
    }
    // A scrollend left over from the opening scroll can arrive first, so only the one at the natural end counts.
    const finishAtNaturalEnd = (): void => {
      if (scroller.scrollLeft > naturalEnd + 1) return;
      scroller.removeEventListener('scrollend', finishAtNaturalEnd);
      finish();
    };
    scroller.addEventListener('scrollend', finishAtNaturalEnd);
    const fallback = window.setTimeout(() => {
      scroller.removeEventListener('scrollend', finishAtNaturalEnd);
      finish();
    }, SCROLL_SETTLE_FALLBACK_MILLISECONDS);
    cancellers.push(() => {
      window.clearTimeout(fallback);
      scroller.removeEventListener('scrollend', finishAtNaturalEnd);
    });
    scroller.scrollTo({ left: naturalEnd, behavior: 'smooth' });
  }
  return () => cancellers.forEach((cancel) => cancel());
}

/**
 * Makes the room once the item `openItemText` names is laid out and selected, again on every switch of item and window resize, and
 * releases it as the panel closes. `openerOf` answers what held the focus as the item opened: only an opener the view marks selected is
 * scrolled clear, so a link that opened the panel scrolls nothing.
 */
export function usePanelRoom(openItemText: string | null, openerOf: () => HTMLElement | null): void {
  const panelIsOpen = useRef(false);
  const cancelRelease = useRef<() => void>(() => undefined);
  const isOpen = openItemText !== null;

  useEffect(() => {
    panelIsOpen.current = openItemText !== null;
    cancelRelease.current();
    if (openItemText === null) {
      cancelRelease.current = releaseRoom(() => panelIsOpen.current);
      return undefined;
    }
    const frame = requestAnimationFrame(() => {
      makeRoom();
      const opener = openerOf();
      if (opener?.isConnected === true && opener.matches(SELECTED_SELECTOR)) scrollClearOfPanel(opener);
    });
    return () => cancelAnimationFrame(frame);
  }, [openItemText, openerOf]);

  useEffect(() => {
    if (!isOpen) return undefined;
    let frame = 0;
    // After the views' own resize layout, which measures without the room.
    const remakeAfterLayout = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(remakeRoom);
    };
    window.addEventListener('resize', remakeAfterLayout);
    return () => {
      window.removeEventListener('resize', remakeAfterLayout);
      cancelAnimationFrame(frame);
    };
  }, [isOpen]);

  useEffect(() => () => {
    cancelRelease.current();
    for (const shown of shownScrollers()) {
      if (shown.scroller.hasAttribute(PANEL_ROOM_ATTRIBUTE)) dropRoom(shown);
    }
  }, []);
}
