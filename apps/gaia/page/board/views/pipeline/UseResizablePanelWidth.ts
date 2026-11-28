/**
 * The width of a pipeline page's panel column, which User drags from its left edge or steps with the arrow keys: never narrower than the
 * panel's design width, and never so wide that the main column beside it drops below its least width. A finished drag or step is kept
 * in the pipeline's preferences, so every pipeline page opens at it.
 */
import { useCallback, useRef, useState }    from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';

import type { PreferenceStore }   from '../../preferences/PreferenceStore.ts';
import { usePipelinePreferences } from './PipelinePreferencesContext.ts';

export const PANEL_LEAST_WIDTH_PIXELS = 388;

const MAIN_COLUMN_LEAST_WIDTH_PIXELS = 480;
const KEYBOARD_STEP_PIXELS = 24;
const PANEL_WIDTH_CHOICE_NAME = 'pipeline-panel-width';

interface DragStart {
  readonly pointerX:           number;
  readonly panelWidth:         number;
  readonly panelGreatestWidth: number;
}

export interface ResizablePanelWidth {
  readonly panelWidth:    number;
  readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerUp:   (event: PointerEvent<HTMLElement>) => void;
  readonly onKeyDown:     (event: KeyboardEvent<HTMLElement>) => void;
}

function clampedWidth(width: number, greatestWidth: number): number {
  return Math.max(PANEL_LEAST_WIDTH_PIXELS, Math.min(width, greatestWidth));
}

/** The handle sits inside the panel column, whose previous sibling is the main column that gives the panel its room. */
function panelGreatestWidthFor(handle: HTMLElement, panelWidth: number): number {
  const mainColumn = handle.parentElement?.previousElementSibling ?? null;
  if (mainColumn === null) return panelWidth;
  return panelWidth + Math.max(0, mainColumn.clientWidth - MAIN_COLUMN_LEAST_WIDTH_PIXELS);
}

function storedPanelWidthOf(preferences: PreferenceStore | null): number {
  const storedWidth = Number(preferences?.readChoice(PANEL_WIDTH_CHOICE_NAME) ?? Number.NaN);
  return Number.isFinite(storedWidth) ? Math.max(PANEL_LEAST_WIDTH_PIXELS, Math.round(storedWidth)) : PANEL_LEAST_WIDTH_PIXELS;
}

export function useResizablePanelWidth(): ResizablePanelWidth {
  const preferences = usePipelinePreferences();
  const [panelWidth, setPanelWidth] = useState(() => storedPanelWidthOf(preferences));
  const dragStart = useRef<DragStart | null>(null);
  const draggedWidth = useRef(panelWidth);

  const keepPanelWidth = useCallback((width: number) => {
    preferences?.writeChoice(PANEL_WIDTH_CHOICE_NAME, String(width), String(PANEL_LEAST_WIDTH_PIXELS));
  }, [preferences]);

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggedWidth.current = panelWidth;
    dragStart.current = {
      pointerX:           event.clientX,
      panelWidth,
      panelGreatestWidth: panelGreatestWidthFor(event.currentTarget, panelWidth),
    };
  }, [panelWidth]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const start = dragStart.current;
    if (start === null) return;
    // The panel stands right of its handle, so a drag to the left widens it.
    draggedWidth.current = clampedWidth(start.panelWidth + start.pointerX - event.clientX, start.panelGreatestWidth);
    setPanelWidth(draggedWidth.current);
  }, []);

  const onPointerUp = useCallback((event: PointerEvent<HTMLElement>) => {
    if (dragStart.current === null) return;
    dragStart.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    keepPanelWidth(draggedWidth.current);
  }, [keepPanelWidth]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    const widthChange = event.key === 'ArrowLeft' ? KEYBOARD_STEP_PIXELS : event.key === 'ArrowRight' ? -KEYBOARD_STEP_PIXELS : 0;
    if (widthChange === 0) return;
    event.preventDefault();
    const steppedWidth = clampedWidth(panelWidth + widthChange, panelGreatestWidthFor(event.currentTarget, panelWidth));
    setPanelWidth(steppedWidth);
    keepPanelWidth(steppedWidth);
  }, [panelWidth, keepPanelWidth]);

  return {
    panelWidth,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onKeyDown,
  };
}
