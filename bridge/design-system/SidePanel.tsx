/**
 * A non-modal panel over the page's right edge, docked under whatever `dockBelow` returns, sliding in from the right and out again, with a
 * × close, an optional head and foot, and its own scroll between them; a new content key only cross-fades the contents and starts them at
 * the top.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject
} from 'react';

import { IconButton } from './Button.tsx';

const MILLISECONDS_PER_SECOND = 1000;

const SIDE_PANEL_TOP_PROPERTY = '--side-panel-top';

export interface SidePanelProps {
  readonly label:              string;
  /** `detail` the detail panel's width, `question` the wider question panel's. */
  readonly width:              'detail' | 'question';
  /** What the panel's top stays under as the page scrolls; `null` docks it to the window's top. */
  readonly dockBelow:          () => Element | null;
  /** True while the panel slides out; `onClosed` is called once it is gone. */
  readonly isClosing:          boolean;
  readonly onClosed:           () => void;
  readonly onClose:            () => void;
  readonly closeLabel:         string;
  /** Asked once, as the panel first shows: true moves the focus to × so the next Tab walks the panel. */
  readonly focusesCloseOnOpen: () => boolean;
  /** A change replays the cross-fade and starts the scroll at the top. */
  readonly contentKey:         string;
  readonly head?:              ReactNode;
  readonly foot?:              ReactNode;
  readonly children:           ReactNode;
}

function bottomPixelsOf(element: Element | null): number {
  if (element === null) return 0;
  const end = element.getBoundingClientRect().bottom + (Number.parseFloat(getComputedStyle(element).marginBottom) || 0);
  return Math.max(0, Math.round(end));
}

/** The dock's bottom, followed as the page scrolls or the window resizes. */
function useDockedTop(dockBelow: () => Element | null): number {
  const [top, setTop] = useState(0);
  const latestDockBelow = useRef(dockBelow);
  useEffect(() => {
    latestDockBelow.current = dockBelow;
  });
  useLayoutEffect(() => {
    const dock = (): void => setTop(bottomPixelsOf(latestDockBelow.current()));
    dock();
    window.addEventListener('scroll', dock, { passive: true });
    window.addEventListener('resize', dock);
    return () => {
      window.removeEventListener('scroll', dock);
      window.removeEventListener('resize', dock);
    };
  }, []);
  return top;
}

function slideDurationMillisecondsOf(element: HTMLElement): number {
  return (Number.parseFloat(getComputedStyle(element).transitionDuration) || 0) * MILLISECONDS_PER_SECOND;
}

/** Mounted out of view and slid in once laid out; slid out on close and reported gone when the slide ends, at once without motion. */
function useSlide(panel: RefObject<HTMLElement | null>, isClosing: boolean, onClosed: () => void): boolean {
  const [hasEntered, setHasEntered] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      // Reading the layout first commits the out-of-view position, so removing it slides rather than jumps.
      void panel.current?.offsetWidth;
      setHasEntered(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [panel]);
  const closed = useRef(onClosed);
  useEffect(() => {
    closed.current = onClosed;
  }, [onClosed]);
  useEffect(() => {
    if (!isClosing) return undefined;
    const duration = panel.current === null ? 0 : slideDurationMillisecondsOf(panel.current);
    if (duration === 0) {
      closed.current();
      return undefined;
    }
    const timer = window.setTimeout(() => closed.current(), duration);
    return () => window.clearTimeout(timer);
  }, [isClosing, panel]);
  return hasEntered && !isClosing;
}

/** Only on the first showing: new contents while open leave the focus on whatever asked for them. */
function useFocusCloseOnOpen(closeButton: RefObject<HTMLButtonElement | null>, focusesCloseOnOpen: () => boolean): void {
  const asksOnFirstShowing = useRef(focusesCloseOnOpen);
  useEffect(() => {
    if (asksOnFirstShowing.current()) closeButton.current?.focus({ preventScroll: true });
  }, [closeButton]);
}

export function SidePanel({
  label, width, dockBelow, isClosing, onClosed, onClose, closeLabel, focusesCloseOnOpen, contentKey, head, foot, children
}: SidePanelProps) {
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useFocusCloseOnOpen(closeButton, focusesCloseOnOpen);
  const top = useDockedTop(dockBelow);
  const isIn = useSlide(panel, isClosing, onClosed);
  const [shown, setShown] = useState({ contentKey, isSwapped: false });
  if (shown.contentKey !== contentKey) setShown({ contentKey, isSwapped: true });
  const style = { [SIDE_PANEL_TOP_PROPERTY]: `${String(top)}px` } as CSSProperties;
  return (
    <aside ref={panel} className="bridge-side-panel" data-width={width} aria-label={label} data-motion={isIn ? undefined : 'out'} style={style}>
      <IconButton glyph="close" accessibleName={closeLabel} onPress={onClose} buttonRef={closeButton} />
      {head === undefined ? null : <div className="bridge-side-panel-head">{head}</div>}
      <div key={contentKey} className="bridge-side-panel-scroll" data-swapped={shown.isSwapped ? '' : undefined}>
        {children}
      </div>
      {foot === undefined ? null : <div className="bridge-side-panel-foot">{foot}</div>}
    </aside>
  );
}
