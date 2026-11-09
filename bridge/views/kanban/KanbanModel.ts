/**
 * The Kanban as lanes of card models, from the Overseer's `BoardState` and the pressed epic chips. Which lane a ticket sits in follows its
 * stored status and the merge queue's facts; which ready tickets come first follows the Board's `readyTickets`, so no rule is copied here.
 */
import { TokenCountUtil }                               from '../../../src/lib/token-count/TokenCountUtil.ts';
import type { DisplayState }                            from '../../../src/lib/tracker-model/@types/Task.ts';
import type { TicketPriority, TicketSize, TicketType }  from '../../../src/lib/tracker-model/@types/Ticket.ts';
import { FIRST_REPEAT_REVIEW_ROUND }                    from '../../../src/lib/tracker-model/constants/ReviewRounds.ts';
import type { DependencyGraph }                         from '../../@types/DependencyGraph.ts';
import type { KanbanBoardState, KanbanEpicDocument }    from '../../@types/KanbanBoardState.ts';
import type { KanbanFilingDraft, KanbanTicketDocument } from '../../@types/KanbanBoardState.ts';
import type { KanbanTaskDocument }                      from '../../@types/KanbanBoardState.ts';
import { ChipFilterUtil }                               from '../../chips/ChipFilterUtil.ts';
import { DependencyGraphUtil }                          from '../../utils/DependencyGraphUtil.ts';
import { DisplayStateWordingUtil }                      from '../../utils/DisplayStateWordingUtil.ts';
import { DraftWordingUtil }                             from '../../utils/DraftWordingUtil.ts';
import type { FinishedWorkChoice }                      from '../../utils/FinishedWorkUtil.ts';
import { FinishedWorkUtil }                             from '../../utils/FinishedWorkUtil.ts';
import type { KanbanCardStamp, KanbanCardTextFormat }   from './KanbanCardTextUtil.ts';
import { KanbanCardTextUtil }                           from './KanbanCardTextUtil.ts';

export const KANBAN_LANES = ['drafts', 'ready-for-review', 'ready', 'building', 'in-review', 'merge-queue', 'done', 'abandoned'] as const;

export type KanbanLaneKey = typeof KANBAN_LANES[number];

/** The epic filter chip of the tickets in no epic: a space, which an epic key never holds, keeps it apart from every key. */
export const NO_EPIC_CHIP = 'no epic';

export const KANBAN_EPIC_FILTER_CHOICE_NAME = 'kanban-epics';

const PRIORITY_ORDER: readonly TicketPriority[] = ['high', 'normal', 'low'];

const PRIORITY_GROUP_TITLE: Readonly<Record<TicketPriority, string>> = { high: 'High', normal: 'Normal', low: 'Low' };

const NO_ROW_TITLE = 'Low priority: it gets a row on the Progress chart once it is started';

/** The tickets User has yet to ready take their lane's state, whatever the Board's display state, so they read as not on the board yet. */
const READINESS_LANE_STATE: Partial<Readonly<Record<KanbanLaneKey, DisplayState>>> = { 'drafts': 'draft', 'ready-for-review': 'ready-for-review' };

/** Building and In review divide their cards by whether an agent is at work on them, the working group first. */
export type KanbanStateGroup = 'building' | 'paused' | 'reviewing' | 'awaiting-review';

const STATE_GROUP_FOR_DISPLAY_STATE: Partial<Readonly<Record<DisplayState, KanbanStateGroup>>> = {
  'in-progress': 'building',
  'paused':      'paused',
  'reviewing':   'reviewing',
  're-review':   'reviewing',
  'in-review':   'awaiting-review',
};

const STATE_GROUP_TITLE: Readonly<Record<KanbanStateGroup, string>> = {
  'building':        'Building',
  'paused':          'Paused',
  'reviewing':       'Reviewing',
  'awaiting-review': 'Awaiting review',
};

const WAITING_STATE_GROUPS: ReadonlySet<KanbanStateGroup> = new Set(['paused', 'awaiting-review']);

/** An agent is at work on a card in these states, so it pulses while the board is live. */
const LIVE_DISPLAY_STATES: ReadonlySet<DisplayState> = new Set(['in-progress', 'reviewing', 're-review']);

interface LaneDesign {
  readonly title:     string;
  /** The state token its head's colours come from. */
  readonly dotState:  string;
  readonly emptyText: string;
  /** The head hover's words before its counts. */
  readonly leading:   string | null;
}

const LANE_DESIGN: Readonly<Record<KanbanLaneKey, LaneDesign>> = {
  'drafts': {
    title: 'Drafts', dotState: 'draft', emptyText: 'No draft waiting.', leading: null
  },
  'ready-for-review': {
    title: 'Ready for review', dotState: 'ready-for-review', emptyText: 'No ticket waits for your review.', leading: null
  },
  'ready': {
    title: 'Ready', dotState: 'pending', emptyText: 'Nothing waiting to start.', leading: null
  },
  'building': {
    title: 'Building', dotState: 'in-progress', emptyText: 'Nothing being built.', leading: null
  },
  'in-review': {
    title: 'In review', dotState: 'reviewing', emptyText: 'Nothing in review.', leading: null
  },
  'merge-queue': {
    title: 'Merge queue', dotState: 'reviewed', emptyText: 'Nothing awaiting merge.', leading: 'by priority'
  },
  'done': {
    title: 'Done', dotState: 'delivered', emptyText: 'Nothing done yet.', leading: 'newest first'
  },
  'abandoned': {
    title: 'Abandoned', dotState: 'abandoned', emptyText: 'Nothing abandoned.', leading: 'newest first'
  },
};

/** The word a closed lane's empty text uses for its closing, as its stamps do. */
const CLOSED_LANE_VERB: Readonly<Record<KanbanClosedLaneKey, string>> = { done: 'done', abandoned: 'abandoned' };

export interface KanbanEpicChip {
  readonly key:   string;
  readonly title: string;
  readonly slot:  number;
}

/** What a card offers; each is a `ControlCommand` the Overseer applies or refuses. */
export interface KanbanCardActions {
  /** A draft ticket or a ticket ready for review: `ticket-ready`. */
  readonly readies:         boolean;
  /** A ready-lane ticket: `ticket-hold` or `ticket-unhold`, `null` elsewhere. */
  readonly holdMove:        'hold' | 'unhold' | null;
  /** A ready-lane ticket: the priorities `ticket-priority` may move it to, every one but its own. */
  readonly priorityChoices: readonly TicketPriority[];
}

/** `↦ N`: how many open tickets wait on an unfinished one, directly or further down the chain. */
export interface KanbanHeldCount {
  readonly count:   number;
  /** From `HEAVY_HELD_COUNT` waiting tickets on, the mark reads in full ink. */
  readonly isHeavy: boolean;
  readonly title:   string;
}

export interface KanbanCardModel {
  /** `ticket:<id>` or `draft:<id>`, unique across the board. */
  readonly key:                string;
  readonly ticketId:           string | null;
  /** A filing draft's id; `null` on a ticket's card. */
  readonly filingDraftId:      string | null;
  readonly idText:             string;
  readonly title:              string;
  /** `draft` for both kinds of draft. */
  readonly stateToken:         DisplayState;
  /** The ticket has a row on the Progress chart, so its card carries the row's bar. */
  readonly hasRow:             boolean;
  /** An agent is at work on it. */
  readonly isLive:             boolean;
  /** "draft ticket" or "filing draft"; `null` on every other card. */
  readonly draftLabel:         string | null;
  readonly size:               TicketSize | null;
  /** A priority other than `normal`, off the lanes a ticket is readied in; `normal` is the unmarked priority. */
  readonly priority:           Exclude<TicketPriority, 'normal'> | null;
  /** Bug or research; a plain ticket shows no type. */
  readonly ticketType:         Exclude<TicketType, 'ticket'> | null;
  readonly tokensText:         string | null;
  readonly epics:              readonly KanbanEpicChip[];
  readonly waitingOnTicketIds: readonly string[];
  readonly heldTitle:          string | null;
  /** A Ready ticket with no row yet: why it has none. */
  readonly noRowTitle:         string | null;
  /** When a reviewed ticket was reviewed, why an abandoned one was abandoned, or a filing draft's state line. */
  readonly note:               string | null;
  /** A Done ticket that was reviewed before it was done: the ✓ mark's hover. */
  readonly reviewedTitle:      string | null;
  readonly stamp:              KanbanCardStamp | null;
  readonly ariaLabel:          string;
  readonly actions:            KanbanCardActions;
  /** Another ticket depends on this one: its card can show "needed first" while a dependent is hovered. */
  readonly hasNeededFirst:     boolean;
  readonly heldCount:          KanbanHeldCount | null;
  /** The tickets this one directly depends on, which its hover arrows come from. */
  readonly dependsOnTicketIds: readonly string[];
}

/** A run of a lane's cards under one head: none, a priority, whether an agent works on them, or a wave of the Ready lane by wave. */
export type KanbanCardGroupModel =
  | { readonly kind: 'plain'; readonly key: string; readonly cards: readonly KanbanCardModel[] }
  | {
    readonly kind:     'priority';
    readonly key:      string;
    readonly priority: TicketPriority;
    readonly title:    string;
    readonly count:    number;
    readonly cards:    readonly KanbanCardModel[];
  }
  | {
    readonly kind:       'state';
    readonly key:        string;
    readonly stateGroup: KanbanStateGroup;
    readonly title:      string;
    readonly count:      number;
    readonly cards:      readonly KanbanCardModel[];
  }
  | {
    readonly kind:     'wave';
    readonly key:      string;
    readonly label:    string;
    readonly note:     string;
    /** A one-ticket wave: the bottleneck. */
    readonly isNarrow: boolean;
    readonly cards:    readonly KanbanCardModel[];
  };

export interface KanbanLanePaging {
  readonly shownCount:    number;
  readonly laneCount:     number;
  /** 0 once every card shows. */
  readonly nextPageSize:  number;
  /** The first page's size while more than it shows, so the lane can go back to it; otherwise `null`. */
  readonly firstPageSize: number | null;
}

/** A closed lane's footer: its paging while it holds more than a page, and how many cards the finished-work window hides. */
export interface KanbanLaneFooter {
  readonly paging:      KanbanLanePaging | null;
  readonly hiddenCount: number;
}

export interface KanbanLaneCollapse {
  readonly isCollapsed: boolean;
  readonly toggleTitle: string;
}

export interface KanbanLaneModel {
  readonly key:                KanbanLaneKey;
  readonly title:              string;
  readonly dotState:           string;
  /** Every card in the lane the finished-work window lets through, paged or not. */
  readonly count:              number;
  /** The head's hover: the lane's own counts and order, `null` when it has none to tell. */
  readonly subtitle:           string | null;
  /** The cards shown, in order: a closed lane's current pages, the Ready lane in wave order when it is ordered by wave. */
  readonly cards:              readonly KanbanCardModel[];
  /** `cards` divided under their group heads. */
  readonly groups:             readonly KanbanCardGroupModel[];
  readonly footer:             KanbanLaneFooter | null;
  /** The Abandoned lane's fold; `null` on every other lane. */
  readonly collapse:           KanbanLaneCollapse | null;
  readonly emptyText:          string;
  /** The ids a multi-select Ready may send: the Drafts and Ready for review lanes' tickets, empty on every other lane. */
  readonly readyableTicketIds: readonly string[];
}

/** `filed` is the Board's order to take the ready tickets. */
export const KANBAN_READY_ORDERS = ['filed', 'by-wave'] as const;

export type KanbanReadyOrder = typeof KANBAN_READY_ORDERS[number];

export type KanbanClosedLaneKey = 'done' | 'abandoned';

/** The viewer's layout choices the model lays the lanes out by. */
export interface KanbanLayoutChoices {
  readonly readyOrder:             KanbanReadyOrder;
  readonly abandonedLaneIsOpen:    boolean;
  /** The cards a closed lane was asked to show; clamped to its first page and its count. */
  readonly shownCountByClosedLane: Readonly<Record<KanbanClosedLaneKey, number>>;
}

/** What the board is read against: the moment its stamps are measured to and the finished-work window the closed lanes show. */
export interface KanbanSurroundings {
  readonly nowEpochMilliseconds:    number;
  readonly todayCalendarDate:       string;
  readonly finishedWorkChoice:      FinishedWorkChoice;
  /** `-Infinity` for all. */
  readonly cutoffEpochMilliseconds: number;
}

export const CLOSED_LANE_FIRST_PAGE_CARDS = 15;

export const CLOSED_LANE_PAGE_STEP_CARDS = 25;

/** From this many tickets waiting on a card, its `↦ N` reads in full ink. */
const HEAVY_HELD_COUNT = 5;

export const DEFAULT_KANBAN_LAYOUT: KanbanLayoutChoices = {
  readyOrder:             'filed',
  abandonedLaneIsOpen:    false,
  shownCountByClosedLane: { done: CLOSED_LANE_FIRST_PAGE_CARDS, abandoned: CLOSED_LANE_FIRST_PAGE_CARDS },
};

export const KANBAN_READY_ORDER_CHOICE_NAME = 'kanban-todo-order';
export const KANBAN_ABANDONED_LANE_CHOICE_NAME = 'kanban-abandoned';
export const ABANDONED_LANE_OPEN_CHOICE = 'open';
export const ABANDONED_LANE_CLOSED_CHOICE = 'closed';
// A literal map rather than the lane value, so renaming a lane cannot move a viewer's stored key.
export const CLOSED_LANE_SHOWN_CHOICE_NAME: Readonly<Record<KanbanClosedLaneKey, string>> = {
  done:      'kanban-done-shown',
  abandoned: 'kanban-abandoned-shown',
};

/** A hover arrow's source: a shown card the hovered card directly depends on. */
export interface KanbanDependencyArrowLink {
  readonly dependencyCardKey: string;
  readonly isSameLane:        boolean;
}

export interface KanbanFilterChipModel {
  readonly value: string;
  readonly label: string;
  readonly slot?: number;
}

export interface KanbanViewModel {
  readonly lanes:                readonly KanbanLaneModel[];
  readonly epicChips:            readonly KanbanFilterChipModel[];
  /** The stored chips still naming a chip on the board; a stored chip whose epic went presses nothing. */
  readonly pressedChips:         readonly string[];
  readonly countByChip:          ReadonlyMap<string, number>;
  /** Some ticket depends on another; without one the Ready lane offers no wave order. */
  readonly boardHasDependencies: boolean;
  /** The order the Ready lane is in: `filed` on a board without dependencies, whatever was stored. */
  readonly readyOrder:           KanbanReadyOrder;
  /** Some shown card's stamp is a working card's time at work. */
  readonly hasTickingStamp:      boolean;
}

const NO_ACTIONS: KanbanCardActions = { readies: false, holdMove: null, priorityChoices: [] };

/** Within one pixel the board counts as scrolled to that edge, so rounding never leaves a fade over a card. */
const OVERFLOW_TOLERANCE_PIXELS = 1;

function priorityOf(ticket: KanbanTicketDocument): TicketPriority {
  return ticket.priority ?? 'normal';
}

function laneOf(ticket: KanbanTicketDocument, queuedTicketIds: ReadonlySet<string>): KanbanLaneKey {
  if (queuedTicketIds.has(ticket.id)) return 'merge-queue';
  switch (ticket.status) {
    case 'draft':
      return 'drafts';
    case 'ready-for-review':
      return 'ready-for-review';
    case 'pending':
      return 'ready';
    case 'in-progress':
      return 'building';
    case 'in-review':
      return 'in-review';
    case 'reviewed':
      return 'merge-queue';
    case 'delivered':
      return 'done';
    case 'abandoned':
      return 'abandoned';
    default:
      return 'ready';
  }
}

function epicChipsOf(ticket: KanbanTicketDocument): readonly string[] {
  const epicKeys = ticket.epics ?? [];
  return epicKeys.length === 0 ? [NO_EPIC_CHIP] : epicKeys;
}

function heldTitleOf(hold: string | undefined): string | null {
  if (hold === undefined) return null;
  return hold === '' ? 'Held' : `Held: ${hold}`;
}

/** The lanes whose tickets User readies: the drafts, and the tickets that wait for User's ticket review. */
function laneIsReadiable(lane: KanbanLaneKey): boolean {
  return lane === 'drafts' || lane === 'ready-for-review';
}

function actionsOf(ticket: KanbanTicketDocument, lane: KanbanLaneKey): KanbanCardActions {
  if (laneIsReadiable(lane)) return { ...NO_ACTIONS, readies: true };
  if (lane !== 'ready') return NO_ACTIONS;
  const priority = priorityOf(ticket);
  return {
    readies:         false,
    holdMove:        ticket.hold === undefined ? 'hold' : 'unhold',
    priorityChoices: PRIORITY_ORDER.filter((choice) => choice !== priority),
  };
}

type TicketFacts = KanbanBoardState['page']['payload']['boardFacts']['tickets'][number];

interface CardSources {
  readonly epicByKey:           ReadonlyMap<string, KanbanEpicDocument>;
  readonly factsById:           ReadonlyMap<string, TicketFacts>;
  readonly rowAt:               (position: number | null) => KanbanTaskDocument | null;
  readonly rowCountsAsReviewed: (position: number | null) => boolean;
  readonly graph:               DependencyGraph;
  /** Every ticket some ticket on the board depends on. */
  readonly dependedOnTicketIds: ReadonlySet<string>;
  readonly textFormat:          KanbanCardTextFormat;
}

function laneIsClosed(lane: KanbanLaneKey): lane is KanbanClosedLaneKey {
  return lane === 'done' || lane === 'abandoned';
}

/** `↦ N` for an unfinished ticket others wait on; a board without dependencies gets none. */
function heldCountOf(ticketId: string, lane: KanbanLaneKey, graph: DependencyGraph): KanbanHeldCount | null {
  const count = laneIsClosed(lane) ? 0 : graph.heldOfNode.get(ticketId)?.size ?? 0;
  return count === 0
    ? null
    : { count, isHeavy: count >= HEAVY_HELD_COUNT, title: `${count} ${count === 1 ? 'ticket waits' : 'tickets wait'} on this one, directly or further down the chain` };
}

function displayStateOf(ticket: KanbanTicketDocument, sources: CardSources): DisplayState {
  return sources.factsById.get(ticket.id)?.displayState ?? ticket.status;
}

function ticketCardOf(ticket: KanbanTicketDocument, lane: KanbanLaneKey, sources: CardSources): KanbanCardModel {
  const facts         = sources.factsById.get(ticket.id);
  const ownRowPosition = facts?.ownRowPosition ?? null;
  const ownRow        = sources.rowAt(ownRowPosition);
  const tokens        = ownRow?.tokens ?? null;
  const priority      = priorityOf(ticket);
  const isDraft       = lane === 'drafts';
  const displayState  = displayStateOf(ticket, sources);
  const laneState     = READINESS_LANE_STATE[lane];
  const textSource    = {
    ticket, displayState, ownRow, reviewRows: (facts?.reviewBarPositions ?? []).flatMap((position) => sources.rowAt(position) ?? [])
  };
  return {
    key:           `ticket:${ticket.id}`,
    ticketId:      ticket.id,
    filingDraftId: null,
    idText:        `#${ticket.id}`,
    title:         ticket.title,
    stateToken:    laneState ?? displayState,
    hasRow:        ownRow !== null,
    isLive:        LIVE_DISPLAY_STATES.has(displayState),
    draftLabel:    isDraft ? 'draft ticket' : null,
    size:          ticket.size ?? null,
    priority:      laneIsReadiable(lane) || priority === 'normal' ? null : priority,
    ticketType:    ticket.type === 'ticket' ? null : ticket.type,
    tokensText:    tokens === null ? null : `${TokenCountUtil.formatTokenCount(tokens)} tokens`,
    epics:         (ticket.epics ?? []).flatMap((key) => {
      const epic = sources.epicByKey.get(key);
      return epic === undefined ? [] : [{ key: epic.key, title: epic.title, slot: epic.slot }];
    }),
    waitingOnTicketIds: facts?.waitingOnTicketIds ?? [],
    heldTitle:          heldTitleOf(ticket.hold),
    noRowTitle:         lane === 'ready' && ownRow === null ? NO_ROW_TITLE : null,
    note:               KanbanCardTextUtil.cardNoteOf(textSource, sources.textFormat),
    reviewedTitle:      lane === 'done' && ownRow !== null && sources.rowCountsAsReviewed(ownRowPosition)
      ? KanbanCardTextUtil.reviewedTitleOf(ownRow, sources.textFormat)
      : null,
    stamp:     KanbanCardTextUtil.cardStampOf(textSource, sources.textFormat, lane === 'merge-queue'),
    ariaLabel: laneState === undefined
      ? `#${ticket.id} ${ticket.title}, ${DisplayStateWordingUtil.stateLabelOf(displayState, ownRow?.reviewRound ?? FIRST_REPEAT_REVIEW_ROUND)}, ${priority} priority`
      : `#${ticket.id} ${ticket.title}, ${isDraft ? 'draft ticket' : wordOf(laneState)}`,
    actions:            actionsOf(ticket, lane),
    hasNeededFirst:     sources.dependedOnTicketIds.has(ticket.id),
    heldCount:          heldCountOf(ticket.id, lane, sources.graph),
    dependsOnTicketIds: ticket.dependsOn ?? [],
  };
}

function filingDraftCardOf(draft: KanbanFilingDraft): KanbanCardModel {
  const stateLine = DraftWordingUtil.stateLineOf(draft);
  return {
    key:                `draft:${draft.id}`,
    ticketId:           null,
    filingDraftId:      draft.id,
    idText:             draft.id,
    title:              draft.title,
    stateToken:         'draft',
    hasRow:             false,
    isLive:             false,
    draftLabel:         'filing draft',
    size:               null,
    priority:           null,
    ticketType:         null,
    tokensText:         null,
    epics:              [],
    waitingOnTicketIds: [],
    heldTitle:          null,
    noRowTitle:         null,
    note:               stateLine,
    reviewedTitle:      null,
    stamp:              null,
    ariaLabel:          `Draft ${draft.id} ${draft.title}, ${stateLine}`,
    actions:            NO_ACTIONS,
    hasNeededFirst:     false,
    heldCount:          null,
    dependsOnTicketIds: [],
  };
}

function laneIsDividedByState(lane: KanbanLaneKey): boolean {
  return lane === 'building' || lane === 'in-review';
}

function stateGroupOf(displayState: DisplayState): KanbanStateGroup | null {
  return STATE_GROUP_FOR_DISPLAY_STATE[displayState] ?? null;
}

function stateGroupRankOf(displayState: DisplayState): number {
  const stateGroup = stateGroupOf(displayState);
  return stateGroup !== null && WAITING_STATE_GROUPS.has(stateGroup) ? 1 : 0;
}

/**
 * Ready tickets in the Board's order to take them, then the waiting ones; Building and In review their working cards first; the open
 * lanes otherwise by priority, then id; closed lanes newest first.
 */
function orderedLaneTickets(lane: KanbanLaneKey, tickets: readonly KanbanTicketDocument[], state: KanbanBoardState, sources: CardSources): KanbanTicketDocument[] {
  const leadingIds = lane === 'ready' ? state.page.payload.boardFacts.readyTickets.map((ready) => ready.id) : [];
  const leadingPlace = new Map(leadingIds.map((ticketId, index) => [ticketId, index]));
  const closingStamp = (ticket: KanbanTicketDocument): string => (lane === 'done' ? ticket.delivered : ticket.abandonedAt) ?? '';
  const stateRank = (ticket: KanbanTicketDocument): number => (laneIsDividedByState(lane) ? stateGroupRankOf(displayStateOf(ticket, sources)) : 0);
  return [...tickets].sort((a, b) => {
    if (laneIsClosed(lane)) return closingStamp(b).localeCompare(closingStamp(a)) || a.id.localeCompare(b.id);
    const placeOfA = leadingPlace.get(a.id) ?? leadingIds.length;
    const placeOfB = leadingPlace.get(b.id) ?? leadingIds.length;
    return stateRank(a) - stateRank(b) || placeOfA - placeOfB
      || PRIORITY_ORDER.indexOf(priorityOf(a)) - PRIORITY_ORDER.indexOf(priorityOf(b)) || a.id.localeCompare(b.id);
  });
}

/** Over every ticket on the board, whatever the epic chips show, so a wave and `↦ N` never change with the filter. */
function dependencyGraphOf(state: KanbanBoardState): DependencyGraph {
  const graphTickets = state.page.tickets.map((ticket) => ({ ...ticket, memberOfEpics: (ticket.epics ?? []).map((key) => ({ key })) }));
  return DependencyGraphUtil.dependencyGraphOf(graphTickets, state.page.payload.concurrency.limit);
}

/** A requested count is clamped to the first page … the lane's count, so a lane that shrank never shows an empty page. */
function cappedLaneShownCount(requested: number, laneCount: number): number {
  const wholeRequest = Number.isSafeInteger(requested) ? requested : CLOSED_LANE_FIRST_PAGE_CARDS;
  return Math.max(CLOSED_LANE_FIRST_PAGE_CARDS, Math.min(wholeRequest, laneCount));
}

function shownCountAfterMore(shownCount: number, laneCount: number): number {
  return cappedLaneShownCount(shownCount + CLOSED_LANE_PAGE_STEP_CARDS, laneCount);
}

/** Paging only while the lane holds more than its first page. */
function lanePagingOf(shownCount: number, laneCount: number): KanbanLanePaging | null {
  if (laneCount <= CLOSED_LANE_FIRST_PAGE_CARDS) return null;
  return {
    shownCount,
    laneCount,
    nextPageSize:  Math.min(CLOSED_LANE_PAGE_STEP_CARDS, laneCount - shownCount),
    firstPageSize: shownCount > CLOSED_LANE_FIRST_PAGE_CARDS ? CLOSED_LANE_FIRST_PAGE_CARDS : null,
  };
}

function laneFooterOf(shownCount: number, laneCount: number, hiddenCount: number): KanbanLaneFooter | null {
  const paging = lanePagingOf(shownCount, laneCount);
  return paging === null && hiddenCount <= 0 ? null : { paging, hiddenCount };
}

function abandonedLaneCollapseOf(laneIsOpen: boolean): KanbanLaneCollapse {
  return { isCollapsed: !laneIsOpen, toggleTitle: `${laneIsOpen ? 'Collapse' : 'Show'} the abandoned tickets` };
}

/** The closed lanes hold what the finished-work window lets through, and their empty text says how far back that reaches. */
function emptyTextOf(lane: KanbanLaneKey, finishedWorkChoice: FinishedWorkChoice): string {
  if (!laneIsClosed(lane) || finishedWorkChoice === 'all') return LANE_DESIGN[lane].emptyText;
  return `Nothing ${CLOSED_LANE_VERB[lane]} ${FinishedWorkUtil.windowPhraseOf(finishedWorkChoice)}.`;
}

/**
 * The Ready lane by wave: one group per wave holding Ready cards, in the wave's own order (pace path first, then most held), its note
 * how wide all of the wave is and, on the first, how many are ready; a card the graph places in no wave closes the lane.
 */
function waveGroupsOf(cards: readonly KanbanCardModel[], graph: DependencyGraph, readyTicketIds: ReadonlySet<string>): KanbanCardGroupModel[] {
  const cardById = new Map(cards.flatMap((card) => (card.ticketId === null ? [] : [[card.ticketId, card] as const])));
  const placedIds = new Set<string>();
  const groups = graph.waves.flatMap((wave): KanbanCardGroupModel[] => {
    const waveCards = wave.nodeIds.flatMap((ticketId) => cardById.get(ticketId) ?? []);
    if (waveCards.length === 0) return [];
    waveCards.forEach((card) => placedIds.add(card.ticketId ?? ''));
    const width = wave.isNarrow ? 'one at a time' : `${wave.nodeIds.length} side by side`;
    const readyCount = waveCards.filter((card) => readyTicketIds.has(card.ticketId ?? '')).length;
    return [{
      kind:     'wave',
      key:      `wave-${wave.index}`,
      label:    wave.label,
      note:     wave.index === 0 ? `${readyCount} ready · ${width}` : width,
      isNarrow: wave.isNarrow,
      cards:    waveCards,
    }];
  });
  const unplacedCards = cards.filter((card) => !placedIds.has(card.ticketId ?? ''));
  return unplacedCards.length === 0 ? groups : [...groups, { kind: 'plain', key: 'unplaced', cards: unplacedCards }];
}

/** Consecutive cards of one priority under one head, counting every card of that priority in the lane. */
function priorityGroupsOf(cards: readonly KanbanCardModel[]): KanbanCardGroupModel[] {
  const groups: KanbanCardGroupModel[] = [];
  for (const card of cards) {
    const priority = card.priority ?? 'normal';
    const last = groups.at(-1);
    if (last?.kind === 'priority' && last.priority === priority) {
      groups[groups.length - 1] = { ...last, cards: [...last.cards, card] };
      continue;
    }
    groups.push({
      kind:  'priority',
      key:   `priority-${priority}-${groups.length}`,
      priority,
      title: PRIORITY_GROUP_TITLE[priority],
      count: cards.filter((other) => (other.priority ?? 'normal') === priority).length,
      cards: [card],
    });
  }
  return groups;
}

/** Building and In review: the working group, then the waiting one; an empty group is left out. */
function stateGroupsOf(cards: readonly KanbanCardModel[]): KanbanCardGroupModel[] {
  const groups: KanbanCardGroupModel[] = [];
  for (const card of cards) {
    const stateGroup = stateGroupOf(card.stateToken);
    if (stateGroup === null) continue;
    const last = groups.at(-1);
    if (last?.kind === 'state' && last.stateGroup === stateGroup) {
      groups[groups.length - 1] = { ...last, cards: [...last.cards, card] };
      continue;
    }
    groups.push({
      kind:  'state',
      key:   `state-${stateGroup}`,
      stateGroup,
      title: STATE_GROUP_TITLE[stateGroup],
      count: cards.filter((other) => stateGroupOf(other.stateToken) === stateGroup).length,
      cards: [card],
    });
  }
  return groups;
}

/** Ready and the merge queue divide by priority, but only while they hold more than one. */
function laneIsDividedByPriority(lane: KanbanLaneKey, cards: readonly KanbanCardModel[]): boolean {
  return (lane === 'ready' || lane === 'merge-queue') && new Set(cards.map((card) => card.priority)).size > 1;
}

function cardGroupsOf(lane: KanbanLaneKey, cards: readonly KanbanCardModel[]): KanbanCardGroupModel[] {
  if (cards.length === 0) return [];
  if (laneIsDividedByState(lane)) return stateGroupsOf(cards);
  if (laneIsDividedByPriority(lane, cards)) return priorityGroupsOf(cards);
  return [{ kind: 'plain', key: 'cards', cards }];
}

/** Each count after its mark, a zero count left out: `• 2 in progress`, `✓1 reviewed first`, `1 waiting`. */
function countsTextOf(counts: readonly (readonly [mark: string, count: number, label: string])[]): string[] {
  return counts.filter(([, count]) => count > 0).map(([mark, count, label]) => `${mark}${count} ${label}`);
}

function wordOf(state: DisplayState): string {
  return DisplayStateWordingUtil.labelOf(state).toLowerCase();
}

/** The head's hover: waiting is hollow (○), working filled (•). */
function laneSubtitleOf(lane: KanbanLaneKey, cards: readonly KanbanCardModel[], readyByWave: { readonly readyCount: number } | null): string | null {
  const countOf = (predicate: (card: KanbanCardModel) => boolean): number => cards.filter(predicate).length;
  const stateCountOf = (...states: readonly DisplayState[]): number => countOf((card) => states.includes(card.stateToken));
  if (readyByWave !== null) return `${readyByWave.readyCount} ready · ${cards.length - readyByWave.readyCount} waiting`;
  const countsByLane: Partial<Readonly<Record<KanbanLaneKey, string[]>>> = {
    'ready': countsTextOf([
      ['', countOf((card) => card.waitingOnTicketIds.length > 0), 'waiting'],
      ['', countOf((card) => card.heldTitle !== null), 'held'],
      ['', countOf((card) => card.noRowTitle !== null), 'no row'],
    ]),
    'building':  countsTextOf([['• ', stateCountOf('in-progress'), wordOf('in-progress')], ['○ ', stateCountOf('paused'), wordOf('paused')]]),
    'in-review': countsTextOf([['○ ', stateCountOf('in-review'), wordOf('in-review')], ['• ', stateCountOf('reviewing', 're-review'), wordOf('reviewing')]]),
    'done':      countsTextOf([['✓', countOf((card) => card.reviewedTitle !== null), 'reviewed first']]),
  };
  const parts = [...LANE_DESIGN[lane].leading === null ? [] : [LANE_DESIGN[lane].leading ?? ''], ...countsByLane[lane] ?? []];
  return parts.length === 0 ? null : parts.join(' · ');
}

/** Only an epic holding an open ticket gets a chip, and the no-epic chip only while an open ticket is in no epic. */
function epicChipModelsOf(state: KanbanBoardState): KanbanFilterChipModel[] {
  const openTickets = state.page.tickets.filter((ticket) => ticket.status !== 'delivered' && ticket.status !== 'abandoned');
  const openEpicKeys = new Set(openTickets.flatMap((ticket) => ticket.epics ?? []));
  const epicChips = state.page.payload.boardFacts.epics
    .filter((epic) => openEpicKeys.has(epic.key))
    .map((epic): KanbanFilterChipModel => ({ value: epic.key, label: epic.title, slot: epic.slot }));
  const anyOpenTicketIsInNoEpic = openTickets.some((ticket) => (ticket.epics ?? []).length === 0);
  return anyOpenTicketIsInNoEpic ? [...epicChips, { value: NO_EPIC_CHIP, label: 'No epic' }] : epicChips;
}

function finishedWorkIsShown(ticket: KanbanTicketDocument, cutoffEpochMilliseconds: number): boolean {
  const finishedEpochMilliseconds = FinishedWorkUtil.ticketFinishedEpochMillisecondsOf(ticket);
  return finishedEpochMilliseconds === null || finishedEpochMilliseconds >= cutoffEpochMilliseconds;
}

function kanbanModelOf(
  state: KanbanBoardState,
  storedPressedChips: readonly string[],
  layout: KanbanLayoutChoices,
  surroundings: KanbanSurroundings,
): KanbanViewModel {
  const { boardFacts, progress, limits } = state.page.payload;
  const epicChips    = epicChipModelsOf(state);
  const pressedChips = ChipFilterUtil.knownPressedChips(storedPressedChips, new Set(epicChips.map((chip) => chip.value)));
  const epicFilter   = { pressed: pressedChips, chipsOf: epicChipsOf };
  const countByChip  = ChipFilterUtil.chipCountsOf(state.page.tickets, () => true, [epicFilter], epicFilter, epicChips.map((chip) => chip.value));
  const shownTickets = state.page.tickets.filter((ticket) => ChipFilterUtil.itemMatches(ticket, () => true, [epicFilter]));
  const queuedTicketIds = new Set(state.mergeQueue.queuedTicketIds);
  const rowAt = (position: number | null): KanbanTaskDocument | null => (position === null ? null : progress.tasks[position] ?? null);
  const sources: CardSources = {
    epicByKey:           new Map(boardFacts.epics.map((epic) => [epic.key, epic])),
    factsById:           new Map(boardFacts.tickets.map((facts) => [facts.ticketId, facts])),
    rowAt,
    rowCountsAsReviewed: (position) => (position === null ? false : boardFacts.rows[position]?.deliveredRowCountsAsReviewed === true),
    graph:               dependencyGraphOf(state),
    dependedOnTicketIds: new Set(state.page.tickets.flatMap((ticket) => ticket.dependsOn ?? [])),
    textFormat:          { nowEpochMilliseconds: surroundings.nowEpochMilliseconds, todayCalendarDate: surroundings.todayCalendarDate, limits },
  };
  const boardHasDependencies = sources.dependedOnTicketIds.size > 0;
  const readyOrder = boardHasDependencies ? layout.readyOrder : 'filed';
  const readyTicketIds = new Set(boardFacts.readyTickets.filter((ready) => ready.held !== true).map((ready) => ready.id));
  const lanes = KANBAN_LANES.map((lane): KanbanLaneModel => {
    const members = shownTickets.filter((ticket) => laneOf(ticket, queuedTicketIds) === lane);
    const windowed = laneIsClosed(lane) ? members.filter((ticket) => finishedWorkIsShown(ticket, surroundings.cutoffEpochMilliseconds)) : members;
    const laneTickets = orderedLaneTickets(lane, windowed, state, sources);
    const shownCount = laneIsClosed(lane) ? cappedLaneShownCount(layout.shownCountByClosedLane[lane], laneTickets.length) : laneTickets.length;
    const ticketCards = laneTickets.slice(0, shownCount).map((ticket) => ticketCardOf(ticket, lane, sources));
    const filingDraftCards = lane === 'drafts' ? (boardFacts.drafts ?? []).map(filingDraftCardOf) : [];
    const isByWave = lane === 'ready' && readyOrder === 'by-wave';
    const groups = isByWave ? waveGroupsOf(ticketCards, sources.graph, readyTicketIds) : cardGroupsOf(lane, [...ticketCards, ...filingDraftCards]);
    const readyByWave = isByWave ? { readyCount: ticketCards.filter((card) => readyTicketIds.has(card.ticketId ?? '')).length } : null;
    const design = LANE_DESIGN[lane];
    return {
      key:                lane,
      title:              design.title,
      dotState:           design.dotState,
      count:              laneTickets.length + filingDraftCards.length,
      subtitle:           laneSubtitleOf(lane, ticketCards, readyByWave),
      cards:              groups.flatMap((group) => group.cards),
      groups,
      footer:             laneIsClosed(lane) ? laneFooterOf(shownCount, laneTickets.length, members.length - windowed.length) : null,
      collapse:           lane === 'abandoned' ? abandonedLaneCollapseOf(layout.abandonedLaneIsOpen) : null,
      emptyText:          emptyTextOf(lane, surroundings.finishedWorkChoice),
      readyableTicketIds: laneIsReadiable(lane) ? laneTickets.map((ticket) => ticket.id) : [],
    };
  });
  const hasTickingStamp = lanes.some((lane) => lane.collapse?.isCollapsed !== true && lane.cards.some((card) => card.stamp?.ticks === true));
  return {
    lanes, epicChips, pressedChips, countByChip, boardHasDependencies, readyOrder, hasTickingStamp
  };
}

/**
 * The hover arrows of `hoveredTicketId`'s card: one from each card it directly depends on, where both show; a card in the folded
 * Abandoned lane or past a closed lane's pages shows nowhere.
 */
function dependencyArrowLinksOf(model: KanbanViewModel, hoveredTicketId: string): KanbanDependencyArrowLink[] {
  const laneOfCardKey = new Map(model.lanes
    .filter((lane) => lane.collapse?.isCollapsed !== true)
    .flatMap((lane) => lane.cards.map((card) => [card.key, lane.key] as const)));
  const hoveredCardKey = `ticket:${hoveredTicketId}`;
  const hoveredLane = laneOfCardKey.get(hoveredCardKey);
  const hoveredCard = model.lanes.flatMap((lane) => lane.cards).find((card) => card.key === hoveredCardKey);
  if (hoveredLane === undefined || hoveredCard === undefined) return [];
  return hoveredCard.dependsOnTicketIds.flatMap((dependencyId) => {
    const dependencyCardKey = `ticket:${dependencyId}`;
    const dependencyLane = laneOfCardKey.get(dependencyCardKey);
    return dependencyLane === undefined ? [] : [{ dependencyCardKey, isSameLane: dependencyLane === hoveredLane }];
  });
}

/** `start`, `end`, both space-separated, or `null` when the board fits: the edges the board can still scroll to, which the frame fades. */
function overflowDirectionsOf(scrollLeft: number, scrollWidth: number, clientWidth: number): string | null {
  const scrollableWidth = scrollWidth - clientWidth;
  const directions = [
    ...scrollLeft > OVERFLOW_TOLERANCE_PIXELS ? ['start'] : [],
    ...scrollLeft < scrollableWidth - OVERFLOW_TOLERANCE_PIXELS ? ['end'] : [],
  ];
  return directions.length === 0 ? null : directions.join(' ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The state document as the Kanban reads it, or `null` while it lacks the page payload or the merge queue the Kanban needs. */
function kanbanBoardStateOf(document: unknown): KanbanBoardState | null {
  if (!isRecord(document) || !isRecord(document['page']) || !isRecord(document['mergeQueue'])) return null;
  const { page } = document;
  if (!Array.isArray(page['tickets']) || !isRecord(page['payload']) || !isRecord(page['payload']['boardFacts'])) return null;
  const { payload } = page;
  if (!isRecord(payload['concurrency']) || !isRecord(payload['limits']) || !isRecord(payload['progress'])) return null;
  return document as unknown as KanbanBoardState;
}

export const KanbanModel = Object.freeze({
  kanbanModelOf, kanbanBoardStateOf, dependencyArrowLinksOf, cappedLaneShownCount, shownCountAfterMore, overflowDirectionsOf
});
