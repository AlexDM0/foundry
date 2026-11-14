/**
 * Whether the window is as narrow as the width under which `board.css` wraps the header figures and the tab bar's filter line to the left
 * edge, so a popover hanging from them opens from its anchor's start instead of its end.
 */
import type { PopoverPlacement } from 'design-system/Popover';
import { useSyncExternalStore }  from 'react';


/** The `@media (max-width: 900px)` blocks of `board.css` that move the header figures and the filter line to the left. */
const NARROW_WINDOW_QUERY = '(max-width: 900px)';

function subscribeToWindowWidth(onChange: () => void): () => void {
  const query = window.matchMedia(NARROW_WINDOW_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function windowIsNarrow(): boolean {
  return window.matchMedia(NARROW_WINDOW_QUERY).matches;
}

/** Below the anchor's end, or below its start while the window is narrow. */
export function useEndPlacementOrStartWhenNarrow(): PopoverPlacement {
  return useSyncExternalStore(subscribeToWindowWidth, windowIsNarrow) ? 'below-start' : 'below-end';
}
