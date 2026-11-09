/**
 * The one detail panel of the board tabs, mounted by the shell over Kanban, Waves, Progress, Epics and Tickets. It keeps the last item
 * shown while the panel slides out, closes it on Esc or ×, and then hands the focus back to what opened it, as the static panel does.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';

import type { BoardStateDocument }      from '../@types/BoardStateDocument.ts';
import { DetailPanel }                  from '../views/detail-panel/DetailPanel.tsx';
import { DetailPanelModel }             from '../views/detail-panel/DetailPanelModel.ts';
import { useBridgeClock }               from './BridgeClock.ts';
import { DetailRoute, type DetailItem } from './DetailRoute.ts';
import { useDetailRouting }             from './DetailRouting.ts';

export interface DetailPanelHostProps {
  readonly boardState:        BoardStateDocument;
  /** `null` while no detail is routed: a shown panel then slides out. */
  readonly item:              DetailItem | null;
  readonly todayCalendarDate: string;
}

const PANEL_SELECTOR = '.bridge-detail';

/** What holds the focus as an item opens, unless it is inside the panel: a link there moves the panel, not the place to return to. */
function focusedOpenerOf(): HTMLElement | null {
  const focused = document.activeElement;
  return focused instanceof HTMLElement && focused !== document.body && focused.closest(PANEL_SELECTOR) === null ? focused : null;
}

export function DetailPanelHost({ boardState, item, todayCalendarDate }: DetailPanelHostProps) {
  const routing = useDetailRouting();
  const clock = useBridgeClock();
  const [shownItem, setShownItem] = useState<DetailItem | null>(item);
  if (item !== null && !DetailRoute.detailItemsAreEqual(shownItem, item)) setShownItem(item);
  const opener = useRef<HTMLElement | null>(null);
  const returnsFocus = useRef(false);
  const itemIsRouted = item !== null;

  useEffect(() => {
    if (item === null) return;
    opener.current = focusedOpenerOf() ?? opener.current;
  }, [item]);

  const closeReturningFocus = useCallback(() => {
    returnsFocus.current = true;
    routing.close();
  }, [routing]);

  useEffect(() => {
    if (!itemIsRouted) return undefined;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      closeReturningFocus();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [itemIsRouted, closeReturningFocus]);

  const finishClosing = useCallback(() => {
    setShownItem(null);
    if (returnsFocus.current && opener.current?.isConnected === true) opener.current.focus({ preventScroll: true });
    returnsFocus.current = false;
    opener.current = null;
  }, []);

  const detailBoardState = DetailPanelModel.detailBoardStateOf(boardState);
  if (detailBoardState === null || shownItem === null) return null;
  return (
    <DetailPanel
      boardState={detailBoardState}
      item={shownItem}
      format={{ todayCalendarDate, nowEpochMilliseconds: clock.now().getTime(), limits: detailBoardState.page.payload.limits }}
      isClosing={item === null}
      onClosed={finishClosing}
      onClose={closeReturningFocus}
    />
  );
}
