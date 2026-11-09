/**
 * The detail panel: a non-modal panel over the page's right edge, docked under the tab bar, sliding in from the right and out again, with
 * its own scroll and a × close; switching items only cross-fades its contents and starts them at the top. It shows the ticket, row or
 * draft form the routed item opens, or the line naming what the board lacks.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject
} from 'react';

import type { DetailBoardState }                       from '../../@types/DetailBoardState.ts';
import { DetailRoute, type DetailItem }                from '../../shell/DetailRoute.ts';
import type { DetailFormat }                           from './DetailFactsModel.ts';
import { DetailPanelModel, type DetailPanelViewModel } from './DetailPanelModel.ts';
import { DetailNote }                                  from './DetailParts.tsx';
import { DraftDetail }                                 from './DraftDetail.tsx';
import { RowDetail }                                   from './RowDetail.tsx';
import { TicketDetail }                                from './TicketDetail.tsx';

const MILLISECONDS_PER_SECOND = 1000;

const TAB_BAR_SELECTOR = '.bridge-tab-bar';

const DETAIL_TOP_PROPERTY = '--detail-top';

export interface DetailPanelProps {
  readonly boardState: DetailBoardState;
  readonly item:       DetailItem;
  readonly format:     DetailFormat;
  /** True while the panel slides out; `onClosed` is called once it is gone. */
  readonly isClosing:  boolean;
  readonly onClosed:   () => void;
  readonly onClose:    () => void;
}

function accessibleNameOf(model: DetailPanelViewModel): string {
  switch (model.form) {
    case 'ticket':
      return `Ticket ${model.idText}`;
    case 'row':
      return `Row ${model.head.idText}`;
    case 'draft':
      return `Draft ${model.idText}`;
    default:
      return 'Detail';
  }
}

function FormOf({ model }: { readonly model: DetailPanelViewModel }) {
  switch (model.form) {
    case 'ticket':
      return <TicketDetail model={model} />;
    case 'row':
      return <RowDetail model={model} />;
    case 'draft':
      return <DraftDetail model={model} />;
    default:
      return <DetailNote text={model.text} />;
  }
}

/** Where the tab bar ends, which the panel's top follows as the header scrolls away. */
function tabBarBottomPixelsOf(): number {
  const tabBar = document.querySelector(TAB_BAR_SELECTOR);
  if (tabBar === null) return 0;
  const tabBarEnd = tabBar.getBoundingClientRect().bottom + (Number.parseFloat(getComputedStyle(tabBar).marginBottom) || 0);
  return Math.max(0, Math.round(tabBarEnd));
}

function useDockedTop(): number {
  const [top, setTop] = useState(0);
  useLayoutEffect(() => {
    const dock = (): void => setTop(tabBarBottomPixelsOf());
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

export function DetailPanel({
  boardState, item, format, isClosing, onClosed, onClose
}: DetailPanelProps) {
  const panel = useRef<HTMLElement>(null);
  const top = useDockedTop();
  const isIn = useSlide(panel, isClosing, onClosed);
  const itemText = DetailRoute.itemTextOf(item);
  const [shown, setShown] = useState({ itemText, isSwapped: false });
  if (shown.itemText !== itemText) setShown({ itemText, isSwapped: true });
  const model = DetailPanelModel.detailPanelModelOf(boardState, item, format);
  const style = { [DETAIL_TOP_PROPERTY]: `${String(top)}px` } as CSSProperties;
  return (
    <aside ref={panel} className="bridge-detail" aria-label={accessibleNameOf(model)} data-motion={isIn ? undefined : 'out'} style={style}>
      <button type="button" className="bridge-detail-close" aria-label="Close" onClick={onClose}>×</button>
      <div key={itemText} className="bridge-detail-scroll" data-swapped={shown.isSwapped ? '' : undefined}>
        <FormOf model={model} />
      </div>
    </aside>
  );
}
