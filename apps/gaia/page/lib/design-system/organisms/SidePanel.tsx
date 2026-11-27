/**
 * A non-modal panel over the page's right edge, docked under whatever `dockBelow` returns, sliding in from the right and out again. Its
 * parts are its children: a `SidePanelHead` with the × close and an optional title, a `SidePanelBody` with its own scroll, and an optional
 * `SidePanelFoot`. A new content key on the body only cross-fades the contents and starts them at the top. A host reaches the panel's
 * element through `panelRef` and the body's scrolling element through `scrollRef`, never through their classes.
 */
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
  type RefObject
} from 'react';

import { IconButton }             from '../atoms/IconButton.tsx';
import { Text, type TextElement } from '../atoms/Text.tsx';
import { CssDurationUtil }        from '../utils/CssDurationUtil.ts';

const SIDE_PANEL_TOP_PROPERTY = '--side-panel-top';

/** The head's ×, which the panel focuses on its first showing when asked. */
const CloseButtonContext = createContext<RefObject<HTMLButtonElement | null> | null>(null);

export interface SidePanelProps {
  /** The panel's accessible name. */
  readonly label:               string;
  /** True while the panel slides out; `onClosed` is called once it is gone. */
  readonly isClosing:           boolean;
  readonly onClosed:            () => void;
  /** Its parts: a `SidePanelHead`, a `SidePanelBody` and an optional `SidePanelFoot`. */
  readonly children:            ReactNode;
  /** `detail` the 480px detail panel, the default; `question` the wider question panel. */
  readonly width?:              'detail' | 'question';
  /** What the panel's top stays under as the page scrolls; absent, or returning `null`, the panel docks to the window's top. */
  readonly dockBelow?:          () => Element | null;
  /** Asked once, as the panel first shows: true moves the focus to × so the next Tab walks the panel. */
  readonly focusesCloseOnOpen?: () => boolean;
  /** The panel's element, for a host that asks whether the focus or an event is inside it. */
  readonly panelRef?:           RefObject<HTMLElement | null>;
}

function bottomPixelsOf(element: Element | null): number {
  if (element === null) return 0;
  const end = element.getBoundingClientRect().bottom + (Number.parseFloat(getComputedStyle(element).marginBottom) || 0);
  return Math.max(0, Math.round(end));
}

const NO_DOCK = (): Element | null => null;
const NO_FOCUS_ON_OPEN = (): boolean => false;

/** The dock's bottom, followed as the page scrolls, the window resizes, or the page or the dock changes size, as a banner above it comes. */
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
    const resizeObserver = new ResizeObserver(dock);
    resizeObserver.observe(document.body);
    const dockElement = latestDockBelow.current();
    if (dockElement !== null) resizeObserver.observe(dockElement);
    return () => {
      window.removeEventListener('scroll', dock);
      window.removeEventListener('resize', dock);
      resizeObserver.disconnect();
    };
  }, []);
  return top;
}

function slideDurationMillisecondsOf(element: HTMLElement): number {
  return CssDurationUtil.millisecondsOf(getComputedStyle(element).transitionDuration) ?? 0;
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
  label, isClosing, onClosed, children, width = 'detail', dockBelow = NO_DOCK, focusesCloseOnOpen = NO_FOCUS_ON_OPEN, panelRef
}: SidePanelProps) {
  const ownPanel = useRef<HTMLElement>(null);
  const panel = panelRef ?? ownPanel;
  const closeButton = useRef<HTMLButtonElement>(null);
  useFocusCloseOnOpen(closeButton, focusesCloseOnOpen);
  const top = useDockedTop(dockBelow);
  const isIn = useSlide(panel, isClosing, onClosed);
  const style = { [SIDE_PANEL_TOP_PROPERTY]: `${String(top)}px` } as CSSProperties;
  return (
    <aside ref={panel} className="design-system-side-panel" data-width={width} aria-label={label} data-motion={isIn ? undefined : 'out'} style={style}>
      <CloseButtonContext.Provider value={closeButton}>{children}</CloseButtonContext.Provider>
    </aside>
  );
}

export interface SidePanelHeadProps {
  readonly closeLabel:    string;
  readonly onClose:       () => void;
  /** Drawn in the title role at the head's start; absent, the children may hold a title of their own. */
  readonly title?:        string;
  /** The title's element: a heading level where the panel heads a part of the page; a span by default. */
  readonly titleElement?: TextElement;
  /** What the head holds beside the ×, after the title. */
  readonly children?:     ReactNode;
  /** What shares the head's first line with ×; the title and the children then take the head's full width under that line. */
  readonly firstLine?:    ReactNode;
}

/**
 * The panel's head, which stays put while the body scrolls: its title and children at the start, × at the end, or, with a first line,
 * × at the end of that line over the title and children. With none of them it is the × alone, floating over the top end of the body.
 */
export function SidePanelHead({
  closeLabel, onClose, title, titleElement = 'span', children, firstLine
}: SidePanelHeadProps) {
  const closeButton = useContext(CloseButtonContext);
  const hasContent = title !== undefined || children !== undefined;
  const close = <IconButton glyph="close" accessibleName={closeLabel} onPress={onClose} {...(closeButton === null ? {} : { buttonRef: closeButton })} />;
  const content = hasContent
    ? (
      <div className="design-system-side-panel-head-content">
        {title === undefined ? null : <Text typeRole="title" element={titleElement}>{title}</Text>}
        {children}
      </div>
    )
    : null;
  if (firstLine !== undefined) {
    return (
      <div className="design-system-side-panel-head" data-first-line="">
        <div className="design-system-side-panel-head-first-line">
          {firstLine}
          {close}
        </div>
        {content}
      </div>
    );
  }
  return (
    <div className="design-system-side-panel-head" data-close-alone={hasContent ? undefined : ''}>
      {content}
      {close}
    </div>
  );
}

export interface SidePanelBodyProps {
  readonly children:    ReactNode;
  /** A change replays the cross-fade and starts the scroll at the top; absent, the contents never cross-fade. */
  readonly contentKey?: string;
  /** The scrolling element, for a host that moves the scroll itself. */
  readonly scrollRef?:  Ref<HTMLDivElement>;
}

/** The panel's scrolling middle. */
export function SidePanelBody({ children, contentKey, scrollRef }: SidePanelBodyProps) {
  const [shown, setShown] = useState({ contentKey, isSwapped: false });
  if (shown.contentKey !== contentKey) setShown({ contentKey, isSwapped: true });
  return (
    <div key={contentKey} ref={scrollRef} className="design-system-side-panel-scroll" data-swapped={shown.isSwapped ? '' : undefined}>
      {children}
    </div>
  );
}

export interface SidePanelFootProps {
  readonly children: ReactNode;
}

/** The panel's foot, which stays put under the body. */
export function SidePanelFoot({ children }: SidePanelFootProps) {
  return <div className="design-system-side-panel-foot">{children}</div>;
}
