/**
 * The Kanban: the eight lanes of `KanbanModel`, narrowed and ordered by the filter menu's Kanban sections, each card with its marks and the
 * controls its lane offers in a quiet row shown while the card is hovered or focused. A card opens the ticket or draft form of the detail
 * panel in place, and while the panel is open the board gains scroll room the width of what it covers. A card whose state moved since the
 * previous board is marked for a moment, as is a lane a header figure points at; hovering a card draws arrows from the cards it depends
 * on. The closed lanes' pages and the Abandoned fold are kept per board.
 */
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';

import type { KanbanBoardState }                 from '../../@types/KanbanBoardState.ts';
import { ChipFilterUtil }                        from '../../chips/ChipFilterUtil.ts';
import { CARD_EPIC_CHIP_LIMIT }                  from '../../chips/EpicChipUtil.ts';
import { EpicChips }                             from '../../chips/EpicChips.tsx';
import { PriorityMark, TypeMark, WaitingOnMark } from '../../chips/TicketMarks.tsx';
import { TextButton }                            from '../../design-system/Button.tsx';
import { MonoId }                                from '../../design-system/MonoId.tsx';
import type { PreferenceStore }                  from '../../preferences/PreferenceStore.ts';
import { useBridgeClock }                        from '../../shell/BridgeClock.ts';
import { CommandButton }                         from '../../shell/CommandButton.tsx';
import { DetailRoute, type DetailItem }          from '../../shell/DetailRoute.ts';
import { useDetailRouting }                      from '../../shell/DetailRouting.ts';
import { useFinishedWorkWindow }                 from '../../shell/FinishedWorkWindow.ts';
import { TimeUtil }                              from '../../utils/TimeUtil.ts';
import { KanbanChangeHighlightModel }            from './KanbanChangeHighlightModel.ts';
import { KanbanDependencyArrowUtil }             from './KanbanDependencyArrowUtil.ts';
import type { ArrowCardBox, DependencyArrow }    from './KanbanDependencyArrowUtil.ts';
import { KanbanModel }                           from './KanbanModel.ts';
import {
  ABANDONED_LANE_CLOSED_CHOICE,
  ABANDONED_LANE_OPEN_CHOICE,
  CLOSED_LANE_FIRST_PAGE_CARDS,
  CLOSED_LANE_SHOWN_CHOICE_NAME,
  KANBAN_ABANDONED_LANE_CHOICE_NAME
} from './KanbanModel.ts';
import type {
  KanbanCardGroupModel,
  KanbanCardModel,
  KanbanClosedLaneKey,
  KanbanDependencyArrowLink,
  KanbanFilterModel,
  KanbanLaneFooter,
  KanbanLaneModel,
  KanbanLayoutChoices
} from './KanbanModel.ts';

/** A header figure asked for a lane; a new `sequence` asks again for the same lane. */
export interface KanbanLaneHighlightRequest {
  readonly laneKey:  string;
  readonly sequence: number;
}

export interface KanbanViewProps {
  readonly boardState:            KanbanBoardState;
  /** The filter menu's pressed epics and Ready order, read against this board. */
  readonly filters:               KanbanFilterModel;
  /** The board's own preferences; `null` until the Overseer named its tracker. */
  readonly boardStore:            PreferenceStore | null;
  /** The event stream is live: working cards pulse and their times tick; otherwise both hold still. */
  readonly streamIsLive:          boolean;
  /** The Merge queue lane's way to the queue's own detail. */
  readonly mergeQueueHref:        string;
  /** A closed lane's "show all": widens the finished-work window to everything. */
  readonly onShowAllFinished:     () => void;
  /** The lane a header figure asked for, shown outlined for `LANE_HIGHLIGHT_MILLISECONDS`; `null` once taken. */
  readonly laneHighlight?:        KanbanLaneHighlightRequest | null;
  /** The view took `laneHighlight`, so a later visit to the tab does not outline the lane again. */
  readonly onLaneHighlightTaken?: () => void;
}

const NOTHING_CHANGED: ReadonlySet<string> = new Set();

/** Inside these a click is the control's own, never the card's. */
const CARD_CONTROL_SELECTOR = 'a, button, input, label';

/** As long as the `bridge-changed` wash lasts in `board.css`; reduced motion holds its outline as long. */
export const CHANGE_HIGHLIGHT_MILLISECONDS = 1200;

export const LANE_HIGHLIGHT_MILLISECONDS = 1200;

/** The room past the panel's edge, so a card scrolled clear of it does not touch it. */
const PANEL_GUTTER_PIXELS = 16;

/** Closing the panel glides the board back to its own end first; past this the room goes even if no `scrollend` came. */
const PANEL_ROOM_RELEASE_MILLISECONDS = 1000;

const DETAIL_WIDTH_PROPERTY = '--detail-w';

const LANE_HEAD_EDGE_PROPERTY = '--s-edge';

function detailItemOf(card: KanbanCardModel): DetailItem | null {
  if (card.ticketId !== null) return { form: 'ticket', ticketId: card.ticketId };
  return card.filingDraftId === null ? null : { form: 'draft', draftId: card.filingDraftId };
}

interface KanbanCardProps {
  readonly card:          KanbanCardModel;
  readonly isChanged:     boolean;
  readonly isSelected:    boolean | null;
  /** A card the hovered card directly depends on. */
  readonly isNeededFirst: boolean;
  readonly onSelect:      (ticketId: string) => void;
  /** Brings the card of a ticket this one waits on into view; `true` when the board shows it. */
  readonly onFollow:      (ticketId: string) => boolean;
}

function KanbanCardControls({ card, isSelected, onSelect }: Pick<KanbanCardProps, 'card' | 'isSelected' | 'onSelect'>) {
  const { ticketId, actions } = card;
  if (ticketId === null || (!actions.readies && actions.holdMove === null && isSelected === null)) return null;
  return (
    <div className="bridge-kanban-actions">
      {isSelected === null
        ? null
        : <input type="checkbox" className="bridge-kanban-select" aria-label={`Select ${card.idText}`} checked={isSelected} onChange={() => onSelect(ticketId)} />}
      {actions.readies ? <CommandButton label="Ready" command={{ kind: 'ticket-ready', ticketReferences: [ticketId] }} /> : null}
      {actions.holdMove === 'hold' ? <CommandButton label="Hold" command={{ kind: 'ticket-hold', ticketReference: ticketId, reason: '' }} /> : null}
      {actions.holdMove === 'unhold' ? <CommandButton label="Unhold" command={{ kind: 'ticket-unhold', ticketReference: ticketId }} /> : null}
      {actions.priorityChoices.length === 0 ? null : <span className="bridge-kanban-actions-label" aria-hidden="true">Priority</span>}
      {actions.priorityChoices.map((priority) => (
        <CommandButton
          key={priority}
          label={priority}
          accessibleName={`Priority ${priority}`}
          command={{ kind: 'ticket-priority', ticketReference: ticketId, priority }}
        />
      ))}
    </div>
  );
}

function KanbanCard({
  card, isChanged, isSelected, isNeededFirst, onSelect, onFollow
}: KanbanCardProps) {
  const routing = useDetailRouting();
  const { heldCount, stamp } = card;
  const item = detailItemOf(card);
  const hasMarks = card.waitingOnTicketIds.length > 0 || card.heldTitle !== null || card.noRowTitle !== null;
  const open = (): void => {
    if (item !== null) routing.toggle(item);
  };
  const openOnClick = (event: MouseEvent<HTMLElement>): void => {
    if (event.target instanceof Element && event.target.closest(CARD_CONTROL_SELECTOR) !== null) return;
    // A click that ends a text selection is the selection's, not an opening.
    if ((window.getSelection()?.toString() ?? '') !== '') return;
    open();
  };
  const openOnKey = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    open();
  };
  return (
    <article
      className="bridge-kanban-card"
      data-card={card.key}
      data-ticket-id={card.ticketId ?? undefined}
      data-state={card.stateToken}
      data-row={card.hasRow ? undefined : 'none'}
      data-live={card.isLive ? '' : undefined}
      data-changed={isChanged ? '' : undefined}
      data-needed-first={isNeededFirst ? '' : undefined}
      data-selected={item !== null && routing.isOpen(item) ? '' : undefined}
      tabIndex={0}
      aria-label={card.ariaLabel}
      onClick={openOnClick}
      onKeyDown={openOnKey}
    >
      <div className="bridge-kanban-card-head">
        <MonoId text={card.idText} />
        {card.size === null ? null : <span className="bridge-kanban-size" data-size={card.size} title={`Size ${card.size}`}>{card.size}</span>}
        {card.priority === null ? null : <PriorityMark priority={card.priority} />}
        {card.ticketType === null ? null : <TypeMark type={card.ticketType} />}
        {card.hasNeededFirst ? <span className="bridge-kanban-needed-first" aria-hidden="true">needed first</span> : null}
        {heldCount === null && card.tokensText === null
          ? null
          : (
            <span className="bridge-kanban-head-end">
              {heldCount === null
                ? null
                : <span className="bridge-kanban-held-count" data-heavy={heldCount.isHeavy ? '' : undefined} title={heldCount.title}>{`↦ ${heldCount.count}`}</span>}
              {card.tokensText === null ? null : <span className="bridge-kanban-tokens">{card.tokensText}</span>}
            </span>
          )}
      </div>
      <p className="bridge-kanban-title" title={card.title}>{card.title}</p>
      {card.epics.length === 0 ? null : <EpicChips epics={card.epics} limit={CARD_EPIC_CHIP_LIMIT} />}
      {hasMarks
        ? (
          <div className="bridge-kanban-marks">
            <WaitingOnMark ticketIds={card.waitingOnTicketIds} hrefOf={(ticketId) => routing.openerHrefOf({ form: 'ticket', ticketId })} onFollow={onFollow} />
            {card.heldTitle === null ? null : <span className="bridge-kanban-held" title={card.heldTitle}>held</span>}
            {card.noRowTitle === null ? null : <span className="bridge-kanban-no-row" title={card.noRowTitle}>no row yet</span>}
          </div>
        )
        : null}
      {card.note === null ? null : <p className="bridge-kanban-note">{card.note}</p>}
      <div className="bridge-kanban-state">
        {card.reviewedTitle === null
          ? null
          : (
            <>
              <span className="bridge-kanban-reviewed-mark" data-state="reviewed" title={card.reviewedTitle} role="img" aria-label="reviewed">✓</span>
              <span>reviewed</span>
            </>
          )}
      </div>
      {stamp === null
        ? null
        : <span className="bridge-kanban-stamp" title={stamp.fullText === stamp.shortText ? undefined : stamp.fullText}>{stamp.shortText}</span>}
      <KanbanCardControls card={card} isSelected={isSelected} onSelect={onSelect} />
    </article>
  );
}

interface KanbanLaneProps {
  readonly lane:                KanbanLaneModel;
  readonly changedCardKeys:     ReadonlySet<string>;
  readonly neededFirstCardKeys: ReadonlySet<string>;
  readonly selectedTicketIds:   readonly string[];
  readonly onSelect:            (ticketId: string) => void;
  readonly onFollow:            (ticketId: string) => boolean;
  /** The outline's colour while a header figure points at the lane, else `null`. */
  readonly highlightEdge:       string | null;
  readonly mergeQueueHref:      string;
  readonly onToggleCollapse:    () => void;
  readonly onShowCount:         (lane: KanbanClosedLaneKey, shownCount: number) => void;
  readonly onShowAllFinished:   () => void;
}

function KanbanLaneFooterView({
  lane, footer, onShowCount, onShowAllFinished
}: {
  readonly lane:              KanbanClosedLaneKey;
  readonly footer:            KanbanLaneFooter;
  readonly onShowCount:       KanbanLaneProps['onShowCount'];
  readonly onShowAllFinished: () => void;
}) {
  const { paging, hiddenCount } = footer;
  return (
    <div className="bridge-lane-more">
      {paging === null
        ? null
        : (
          <>
            <span>{`${paging.shownCount} of ${paging.laneCount} shown`}</span>
            <div className="bridge-segments">
              {paging.nextPageSize > 0
                ? (
                  <button type="button" onClick={() => onShowCount(lane, KanbanModel.shownCountAfterMore(paging.shownCount, paging.laneCount))}>
                    {`Show ${paging.nextPageSize} more`}
                  </button>
                )
                : null}
              {paging.firstPageSize === null
                ? null
                : <button type="button" onClick={() => onShowCount(lane, paging.firstPageSize ?? CLOSED_LANE_FIRST_PAGE_CARDS)}>{`Latest ${paging.firstPageSize}`}</button>}
            </div>
          </>
        )}
      {hiddenCount > 0
        ? (
          <div className="bridge-lane-hidden-line">
            <span>{`${hiddenCount} earlier hidden`}</span>
            <TextButton label="show all" onPress={onShowAllFinished} />
          </div>
        )
        : null}
    </div>
  );
}

function groupHeadOf(group: KanbanCardGroupModel) {
  switch (group.kind) {
    case 'plain':
      return null;
    case 'leading':
      return <div className="bridge-lane-group" data-leading-group={group.leadingGroup}>{group.title} <span className="bridge-lane-group-count">{group.count}</span></div>;
    case 'priority':
      return <div className="bridge-lane-group" data-priority={group.priority}>{group.title} <span className="bridge-lane-group-count">{group.count}</span></div>;
    case 'state':
      return <div className="bridge-lane-group" data-state-group={group.stateGroup}>{group.title} <span className="bridge-lane-group-count">{group.count}</span></div>;
    case 'wave':
      return <div className="bridge-lane-group">{group.label} <span className="bridge-lane-group-note">{group.note}</span></div>;
  }
}

function KanbanLane({
  lane, changedCardKeys, neededFirstCardKeys, selectedTicketIds, onSelect, onFollow, highlightEdge, mergeQueueHref, onToggleCollapse, onShowCount,
  onShowAllFinished
}: KanbanLaneProps) {
  const selectable = new Set(lane.readyableTicketIds);
  const selectedHere = lane.readyableTicketIds.filter((ticketId) => selectedTicketIds.includes(ticketId));
  const isCollapsed = lane.collapse?.isCollapsed === true;
  const cardsElementId = `bridge-lane-${lane.key}-cards`;
  const cardOf = (card: KanbanCardModel) => (
    <KanbanCard
      key={card.key}
      card={card}
      isChanged={changedCardKeys.has(card.key)}
      isSelected={card.ticketId !== null && selectable.has(card.ticketId) ? selectedHere.includes(card.ticketId) : null}
      isNeededFirst={neededFirstCardKeys.has(card.key)}
      onSelect={onSelect}
      onFollow={onFollow}
    />
  );
  const hasHeadControls = lane.key === 'merge-queue' || selectable.size > 0;
  return (
    <section
      className="bridge-lane"
      data-lane={lane.key}
      data-collapsed={isCollapsed ? '' : undefined}
      data-highlighted={highlightEdge === null ? undefined : ''}
      style={highlightEdge === null ? undefined : { '--lane-highlight-edge': highlightEdge } as CSSProperties}
      aria-label={lane.title}
    >
      <div className="bridge-lane-head" data-state={lane.dotState} title={lane.subtitle ?? undefined}>
        {lane.collapse === null
          ? (
            <>
              <h2 className="bridge-lane-title">{lane.title}</h2>
              <span className="bridge-lane-count">{lane.count}</span>
            </>
          )
          : (
            <button
              type="button"
              className="bridge-lane-toggle"
              aria-expanded={!isCollapsed}
              aria-controls={cardsElementId}
              aria-label={lane.collapse.toggleTitle}
              title={lane.collapse.toggleTitle}
              onClick={onToggleCollapse}
            >
              <span className="bridge-lane-title">{lane.title}</span>
              <span className="bridge-lane-count">{lane.count}</span>
            </button>
          )}
        {hasHeadControls
          ? (
            <div className="bridge-lane-head-end">
              {lane.key === 'merge-queue' ? <a className="bridge-lane-head-link" href={mergeQueueHref} aria-label="Merge queue details">details</a> : null}
              {selectable.size === 0
                ? null
                : <CommandButton label="Ready selected" command={{ kind: 'ticket-ready', ticketReferences: selectedHere }} hasNothingToSend={selectedHere.length === 0} />}
            </div>
          )
          : null}
      </div>
      {isCollapsed
        ? null
        : (
          <div className="bridge-lane-cards" id={cardsElementId}>
            {lane.cards.length === 0 ? <p className="bridge-lane-empty">{lane.emptyText}</p> : null}
            {lane.groups.map((group) => (group.kind === 'wave'
              ? (
                <div key={group.key} className="bridge-lane-wave" data-wave={group.key} data-narrow={group.isNarrow ? '' : undefined}>
                  {groupHeadOf(group)}
                  {group.cards.map(cardOf)}
                </div>
              )
              : (
                <Fragment key={group.key}>
                  {groupHeadOf(group)}
                  {group.cards.map(cardOf)}
                </Fragment>
              )))}
          </div>
        )}
      {isCollapsed || lane.footer === null || (lane.key !== 'done' && lane.key !== 'abandoned')
        ? null
        : <KanbanLaneFooterView lane={lane.key} footer={lane.footer} onShowCount={onShowCount} onShowAllFinished={onShowAllFinished} />}
    </section>
  );
}

const ARROW_STAGGER_MILLISECONDS = 90;

interface ShownArrows {
  readonly hoveredTicketId: string;
  readonly arrows:          readonly DependencyArrow[];
  /** The first drawing animates in; a re-measure after a lane scroll draws still. */
  readonly drawsIn:         boolean;
}

function cardElementWithin(frame: HTMLElement, cardKey: string): HTMLElement | null {
  const element = [...frame.querySelectorAll('[data-card]')].find((candidate) => candidate.getAttribute('data-card') === cardKey);
  return element instanceof HTMLElement ? element : null;
}

/** A card's box relative to the frame, or `null` for a card not laid out. */
function cardBoxWithin(frame: HTMLElement, frameBox: DOMRect, cardKey: string): ArrowCardBox | null {
  const box = cardElementWithin(frame, cardKey)?.getBoundingClientRect();
  if (box === undefined || (box.width === 0 && box.height === 0)) return null;
  return {
    left: box.left - frameBox.left, right: box.right - frameBox.left, top: box.top - frameBox.top, height: box.height
  };
}

function measuredArrowsOf(frame: HTMLElement, hoveredTicketId: string, links: readonly KanbanDependencyArrowLink[]): DependencyArrow[] {
  const frameBox = frame.getBoundingClientRect();
  const targetBox = cardBoxWithin(frame, frameBox, `ticket:${hoveredTicketId}`);
  if (targetBox === null) return [];
  return links.flatMap((link) => {
    const sourceBox = cardBoxWithin(frame, frameBox, link.dependencyCardKey);
    return sourceBox === null ? [] : [KanbanDependencyArrowUtil.dependencyArrowOf(sourceBox, targetBox, link.isSameLane)];
  });
}

function storedShownCountOf(boardStore: PreferenceStore | null, lane: KanbanClosedLaneKey): number {
  return Number(boardStore?.readChoice(CLOSED_LANE_SHOWN_CHOICE_NAME[lane]) ?? Number.NaN);
}

/** While the detail panel is open: the board's added room at its end, how much of it the panel covers, and the lane width it froze. */
interface PanelRoom {
  readonly roomPixels:            number;
  readonly coverPixels:           number;
  readonly frozenLaneWidthPixels: number | null;
}

interface ShownLaneHighlight {
  readonly laneKey: string;
  readonly edge:    string;
}

function scrollBehaviour(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

/** How much of the board the open panel covers: from the board's visible right edge to the panel's left edge. */
function panelCoverPixelsOf(lanes: HTMLElement): number {
  const viewportWidth = document.documentElement.clientWidth;
  const panelWidth = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(DETAIL_WIDTH_PROPERTY)) || 0;
  const panelLeftEdge = viewportWidth - Math.min(panelWidth, viewportWidth);
  const visibleRightEdge = lanes.getBoundingClientRect().left + lanes.clientLeft + lanes.clientWidth;
  return Math.max(0, visibleRightEdge - panelLeftEdge);
}

function laneElementsOf(lanes: HTMLElement): HTMLElement[] {
  return [...lanes.children].filter((child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains('bridge-lane'));
}

function openLaneWidthOf(lanes: HTMLElement): number | null {
  const openLane = laneElementsOf(lanes).find((lane) => !lane.hasAttribute('data-collapsed'));
  return openLane === undefined ? null : openLane.getBoundingClientRect().width;
}

/** Only the board scrolls sideways to the lane: a lane taller than the window would otherwise scroll the page past the tabs. */
function scrollLaneIntoView(lanes: HTMLElement, lane: HTMLElement): void {
  const laneBox = lane.getBoundingClientRect();
  const boardBox = lanes.getBoundingClientRect();
  const overflowLeft = laneBox.left - boardBox.left;
  const overflowRight = laneBox.right - boardBox.right;
  const scrollDelta = overflowLeft < 0 ? overflowLeft : Math.max(0, overflowRight);
  if (scrollDelta !== 0) lanes.scrollBy({ left: scrollDelta, behavior: scrollBehaviour() });
}

function panelRoomStyleOf(panelRoom: PanelRoom): CSSProperties {
  return {
    '--panel-room': `${panelRoom.roomPixels}px`,
    ...(panelRoom.frozenLaneWidthPixels === null ? {} : { '--frozen-lane-w': `${panelRoom.frozenLaneWidthPixels}px` }),
  } as CSSProperties;
}

export function KanbanView({
  boardState, filters, boardStore, streamIsLive, mergeQueueHref, onShowAllFinished, laneHighlight = null, onLaneHighlightTaken
}: KanbanViewProps) {
  const clock = useBridgeClock();
  const routing = useDetailRouting();
  const finishedWork = useFinishedWorkWindow();
  const [selectedTicketIds, setSelectedTicketIds] = useState<readonly string[]>([]);
  const [shownBoardState, setShownBoardState] = useState(boardState);
  const [shownFilters, setShownFilters] = useState(filters);
  const [shownNow, setShownNow] = useState(() => clock.now().getTime());
  const [changedCardKeys, setChangedCardKeys] = useState<ReadonlySet<string>>(NOTHING_CHANGED);
  const [abandonedLaneIsOpenChoice, setAbandonedLaneIsOpenChoice] = useState<boolean | null>(null);
  const [shownCountChoice, setShownCountChoice] = useState<Partial<Record<KanbanClosedLaneKey, number>>>({});
  const [shownArrows, setShownArrows] = useState<ShownArrows | null>(null);
  const [overflowDirections, setOverflowDirections] = useState<string | null>(null);
  const [panelRoom, setPanelRoom] = useState<PanelRoom | null>(null);
  const [shownLaneHighlight, setShownLaneHighlight] = useState<ShownLaneHighlight | null>(null);
  const frameReference = useRef<HTMLDivElement>(null);
  const lanesReference = useRef<HTMLDivElement>(null);
  const panelRoomNow = useRef<PanelRoom | null>(null);
  const cancelLaneHighlight = useRef<(() => void) | null>(null);
  if (boardState !== shownBoardState) {
    setChangedCardKeys(KanbanChangeHighlightModel.changedCardKeysBetween(shownBoardState, boardState));
    setShownBoardState(boardState);
    setShownNow(clock.now().getTime());
    setShownArrows(null);
  }
  if (filters !== shownFilters) {
    setShownFilters(filters);
    setShownArrows(null);
  }

  const layout: KanbanLayoutChoices = {
    abandonedLaneIsOpen:    abandonedLaneIsOpenChoice ?? boardStore?.readChoice(KANBAN_ABANDONED_LANE_CHOICE_NAME) === ABANDONED_LANE_OPEN_CHOICE,
    shownCountByClosedLane: {
      done:      shownCountChoice.done ?? storedShownCountOf(boardStore, 'done'),
      abandoned: shownCountChoice.abandoned ?? storedShownCountOf(boardStore, 'abandoned'),
    },
  };
  const model = KanbanModel.kanbanModelOf(boardState, filters, layout, {
    nowEpochMilliseconds:    shownNow,
    todayCalendarDate:       TimeUtil.calendarDateOf(shownNow),
    finishedWorkChoice:      finishedWork.choice,
    cutoffEpochMilliseconds: finishedWork.cutoffEpochMilliseconds,
  });
  const hoveredLinks = shownArrows === null ? [] : KanbanModel.dependencyArrowLinksOf(model, shownArrows.hoveredTicketId);
  const neededFirstCardKeys = new Set(hoveredLinks.map((link) => link.dependencyCardKey));
  const ticksNow = streamIsLive && model.hasTickingStamp;
  const panelIsOpen = routing.openItem !== null;
  const openItemText = routing.openItem === null ? null : DetailRoute.itemTextOf(routing.openItem);

  useEffect(() => (ticksNow ? clock.everySecond(() => setShownNow(clock.now().getTime())) : undefined), [clock, ticksNow]);
  useEffect(() => (changedCardKeys.size === 0 ? undefined : clock.after(CHANGE_HIGHLIGHT_MILLISECONDS, () => setChangedCardKeys(NOTHING_CHANGED))), [changedCardKeys, clock]);
  useEffect(() => () => cancelLaneHighlight.current?.(), []);

  // The panel's room is no content and what it covers is not in view, so the edge fades read the board as ending at the panel's edge.
  const measureOverflow = (): void => {
    const lanes = lanesReference.current;
    if (lanes === null) return;
    const room = panelRoomNow.current;
    const scrollWidth = lanes.scrollWidth - (room?.roomPixels ?? 0) + (room?.coverPixels ?? 0);
    setOverflowDirections(KanbanModel.overflowDirectionsOf(lanes.scrollLeft, scrollWidth, lanes.clientWidth));
  };
  // Any render can change the board's width; measuring after it keeps the edge fades true without a layout observer.
  useLayoutEffect(measureOverflow);
  useEffect(() => {
    window.addEventListener('resize', measureOverflow);
    return () => window.removeEventListener('resize', measureOverflow);
  }, []);

  useLayoutEffect(() => {
    panelRoomNow.current = panelRoom;
  }, [panelRoom]);

  useLayoutEffect(() => {
    const lanes = lanesReference.current;
    if (lanes === null) return undefined;
    if (panelIsOpen) {
      const makeRoom = (): void => {
        const coverPixels = panelCoverPixelsOf(lanes);
        setPanelRoom((current) => ({
          roomPixels:            coverPixels > 0 ? coverPixels + PANEL_GUTTER_PIXELS : 0,
          coverPixels,
          frozenLaneWidthPixels: current?.frozenLaneWidthPixels ?? openLaneWidthOf(lanes),
        }));
      };
      makeRoom();
      window.addEventListener('resize', makeRoom);
      return () => window.removeEventListener('resize', makeRoom);
    }
    const room = panelRoomNow.current;
    if (room === null) return undefined;
    const naturalEnd = Math.max(0, lanes.scrollWidth - room.roomPixels - lanes.clientWidth);
    if (lanes.scrollLeft <= naturalEnd + 1 || scrollBehaviour() === 'auto') {
      lanes.scrollLeft = Math.min(lanes.scrollLeft, naturalEnd);
      setPanelRoom(null);
      return undefined;
    }
    // The board glides back to its own end first, then the room goes, so nothing it shows jumps.
    const releaseAtNaturalEnd = (): void => {
      if (lanes.scrollLeft <= naturalEnd + 1) setPanelRoom(null);
    };
    lanes.addEventListener('scrollend', releaseAtNaturalEnd);
    const cancelRelease = clock.after(PANEL_ROOM_RELEASE_MILLISECONDS, () => setPanelRoom(null));
    lanes.scrollTo({ left: naturalEnd, behavior: 'smooth' });
    return () => {
      lanes.removeEventListener('scrollend', releaseAtNaturalEnd);
      cancelRelease();
    };
  }, [panelIsOpen, clock]);

  const roomPixels = panelRoom?.roomPixels ?? null;
  useEffect(() => {
    if (openItemText === null || roomPixels === null) return;
    frameReference.current?.querySelector('.bridge-kanban-card[data-selected]')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: scrollBehaviour() });
  }, [openItemText, roomPixels]);

  useLayoutEffect(() => {
    if (laneHighlight === null) return;
    onLaneHighlightTaken?.();
    const lanes = lanesReference.current;
    const lane = lanes === null ? undefined : laneElementsOf(lanes).find((candidate) => candidate.getAttribute('data-lane') === laneHighlight.laneKey);
    if (lanes === null || lane === undefined) return;
    scrollLaneIntoView(lanes, lane);
    const head = lane.querySelector('.bridge-lane-head');
    setShownLaneHighlight({ laneKey: laneHighlight.laneKey, edge: head === null ? '' : getComputedStyle(head).getPropertyValue(LANE_HEAD_EDGE_PROPERTY).trim() });
    cancelLaneHighlight.current?.();
    cancelLaneHighlight.current = clock.after(LANE_HIGHLIGHT_MILLISECONDS, () => setShownLaneHighlight(null));
  }, [laneHighlight, onLaneHighlightTaken, clock]);

  const toggleSelection = (ticketId: string): void => {
    setSelectedTicketIds((selected) => ChipFilterUtil.toggledChips(selected, ticketId));
  };
  const toggleAbandonedLane = (): void => {
    const laneIsOpen = !layout.abandonedLaneIsOpen;
    setAbandonedLaneIsOpenChoice(laneIsOpen);
    setShownArrows(null);
    boardStore?.writeChoice(KANBAN_ABANDONED_LANE_CHOICE_NAME, laneIsOpen ? ABANDONED_LANE_OPEN_CHOICE : ABANDONED_LANE_CLOSED_CHOICE, ABANDONED_LANE_CLOSED_CHOICE);
  };
  const showCount = (lane: KanbanClosedLaneKey, shownCount: number): void => {
    setShownCountChoice((choice) => ({ ...choice, [lane]: shownCount }));
    setShownArrows(null);
    boardStore?.writeChoice(CLOSED_LANE_SHOWN_CHOICE_NAME[lane], String(shownCount), String(CLOSED_LANE_FIRST_PAGE_CARDS));
  };
  const followToCard = (ticketId: string): boolean => {
    const frame = frameReference.current;
    const card = frame === null ? null : cardElementWithin(frame, `ticket:${ticketId}`);
    if (card === null) return false;
    card.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    card.focus();
    return true;
  };
  // Cards are laid out already when the pointer reaches one, and the hover marks change no layout, so the arrows are measured here.
  const drawArrows = (hoveredTicketId: string, drawsIn: boolean): void => {
    const frame = frameReference.current;
    if (frame === null) return;
    const arrows = measuredArrowsOf(frame, hoveredTicketId, KanbanModel.dependencyArrowLinksOf(model, hoveredTicketId));
    setShownArrows({ hoveredTicketId, arrows, drawsIn });
  };
  const hoverCard = (event: MouseEvent<HTMLDivElement>): void => {
    const card = event.target instanceof Element ? event.target.closest('[data-ticket-id]') : null;
    const hoveredTicketId = card?.getAttribute('data-ticket-id') ?? null;
    if (hoveredTicketId !== null && hoveredTicketId !== shownArrows?.hoveredTicketId) drawArrows(hoveredTicketId, true);
  };
  const scrollLanes = (): void => {
    measureOverflow();
    if (shownArrows !== null) drawArrows(shownArrows.hoveredTicketId, false);
  };

  return (
    <section className="bridge-kanban" aria-label="Kanban">
      <div
        className="bridge-kanban-frame"
        ref={frameReference}
        data-overflow={overflowDirections ?? undefined}
        style={panelRoom === null ? undefined : { '--panel-cover': `${panelRoom.coverPixels}px` } as CSSProperties}
        onMouseOver={hoverCard}
        onMouseLeave={() => setShownArrows(null)}
      >
        <div
          className="bridge-kanban-lanes"
          ref={lanesReference}
          data-panel-room={panelRoom === null ? undefined : ''}
          style={panelRoom === null ? undefined : panelRoomStyleOf(panelRoom)}
          onScroll={scrollLanes}
        >
          {model.lanes.map((lane) => (
            <KanbanLane
              key={lane.key}
              lane={lane}
              changedCardKeys={changedCardKeys}
              neededFirstCardKeys={neededFirstCardKeys}
              selectedTicketIds={selectedTicketIds}
              onSelect={toggleSelection}
              onFollow={followToCard}
              highlightEdge={shownLaneHighlight?.laneKey === lane.key ? shownLaneHighlight.edge : null}
              mergeQueueHref={mergeQueueHref}
              onToggleCollapse={toggleAbandonedLane}
              onShowCount={showCount}
              onShowAllFinished={onShowAllFinished}
            />
          ))}
        </div>
        {shownArrows === null || shownArrows.arrows.length === 0
          ? null
          : (
            <svg className="bridge-kanban-arrows" aria-hidden="true" data-still={shownArrows.drawsIn ? undefined : ''}>
              {shownArrows.arrows.map((arrow, index) => (
                <g key={arrow.linePath} data-route={arrow.route} style={{ '--arrow-delay': `${index * ARROW_STAGGER_MILLISECONDS}ms` } as CSSProperties}>
                  <path className="bridge-kanban-arrow-line" pathLength={1} d={arrow.linePath} />
                  <path className="bridge-kanban-arrow-head" d={arrow.headPath} />
                </g>
              ))}
            </svg>
          )}
      </div>
    </section>
  );
}
