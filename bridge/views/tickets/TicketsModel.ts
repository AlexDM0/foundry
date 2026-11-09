/**
 * The Tickets view as a model, from the Overseer's `BoardState` and the viewer's search, chips and sort, narrowing and ordering its table:
 * OR inside a chip group, AND across the search and the groups, a digits query looking for an id alone, ties newest first. Unnarrowed, the
 * table keeps the finished-work window's tickets; a search or a pressed chip looks through every ticket. Each ticket's state and what it
 * waits on are the Board's facts, never derived here. A paused build's pause and an epic's span measure against the moment handed in, a
 * stated clock exception that decides only the text printed.
 */
import type { DisplayState }         from '../../../src/lib/tracker-model/@types/Task.ts';
import type { TicketType }           from '../../../src/lib/tracker-model/@types/Ticket.ts';
import { FIRST_REPEAT_REVIEW_ROUND } from '../../../src/lib/tracker-model/constants/ReviewRounds.ts';
import type { EpicRollupDocument }   from '../../@types/BoardStateDocument.ts';
import type {
  TicketsBoardState,
  TicketsEpicDocument,
  TicketsTaskDocument,
  TicketsTicketDocument
} from '../../@types/TicketsBoardState.ts';
import { ChipFilterUtil, type ChipFilter }                             from '../../chips/ChipFilterUtil.ts';
import type { FilterChip }                                             from '../../chips/FilterChipGroup.tsx';
import { DisplayStateWordingUtil }                                     from '../../utils/DisplayStateWordingUtil.ts';
import { EpicRollupUtil, type EpicRollupFact, type EpicRollupSegment } from '../../utils/EpicRollupUtil.ts';
import { FinishedWorkUtil }                                            from '../../utils/FinishedWorkUtil.ts';
import { HtmlTextUtil }                                                from '../../utils/HtmlTextUtil.ts';
import { SearchMatchUtil, type MatchPiece }                            from '../../utils/SearchMatchUtil.ts';
import { TimeUtil }                                                    from '../../utils/TimeUtil.ts';

/** A status chip names one display state, except `reviewing`, which also holds a repeat review's `re-review`. */
export type TicketStatusChip = Exclude<DisplayState, 're-review'>;

export type TicketSortKey = 'id' | 'title' | 'epic' | 'type' | 'status' | 'branch';

export type TicketSortDirection = 'ascending' | 'descending';

export interface TicketView {
  readonly searchText:    string;
  readonly statusChips:   readonly TicketStatusChip[];
  readonly typeChips:     readonly TicketType[];
  /** Epic keys, and `NO_EPIC_CHIP` for the tickets in none. */
  readonly epicChips:     readonly string[];
  readonly sortKey:       TicketSortKey;
  readonly sortDirection: TicketSortDirection;
}

export const TICKET_STATUS_CHIPS: readonly TicketStatusChip[] = [
  'draft', 'ready-for-review', 'pending', 'in-progress', 'paused', 'in-review', 'reviewing', 'reviewed', 'delivered', 'abandoned',
];

export const TICKET_TYPE_CHIPS: readonly TicketType[] = ['ticket', 'bug', 'research'];

export const TICKET_SORT_KEYS: readonly TicketSortKey[] = ['id', 'title', 'epic', 'type', 'status', 'branch'];

/** The epic chip of the tickets in no epic: a space, which an epic key never holds, keeps it apart from every key. */
export const NO_EPIC_CHIP = 'no epic';

/** The board's stored grouping choice and its two values. */
export const TICKET_GROUPING_CHOICE_NAME = 'ticket-grouping';
export const TICKETS_GROUPED_BY_EPIC_CHOICE = 'epic';
export const TICKETS_FLAT_CHOICE = 'flat';

export const DEFAULT_TICKET_VIEW: TicketView = {
  searchText:    '',
  statusChips:   [],
  typeChips:     [],
  epicChips:     [],
  sortKey:       'id',
  sortDirection: 'descending',
};

const LIFECYCLE_ORDER: readonly DisplayState[] = [
  'draft', 'ready-for-review', 'pending', 'in-progress', 'paused', 'in-review', 'reviewing', 're-review', 'reviewed', 'delivered', 'abandoned',
];

/** A query of digits, with or without its `#`, looks for a ticket id and nothing else, so "12" does not match every body naming a twelve. */
const TICKET_ID_QUERY_PATTERN = /^#?\d+$/;

/** `docs/cli.md`'s name for the branch a group's bundle is built on. */
const GROUP_BRANCH_PREFIX = 'group-';

/** A ticket in no epic, or an empty branch, sorts after every named one, whichever way the column runs. */
const LAST_IN_ORDER = '￿';

/** A ticket with the Board's facts about it joined on by id. */
export interface TicketsBoardTicket {
  readonly document:       TicketsTicketDocument;
  readonly displayState:   DisplayState;
  readonly reviewRound:    number;
  /** The ticket's own row on the chart, `null` while it has none. */
  readonly ownRow:         TicketsTaskDocument | null;
  readonly waitingOn:      readonly string[];
  /** The epics of its `epics` list the board knows, its primary epic first. */
  readonly memberOfEpics:  readonly TicketsEpicDocument[];
  readonly searchableText: string;
}

/** The branch mark of a grouped ticket: the group, marked by the search, and where it lands on hover. */
export interface TicketIntegrationModel {
  readonly groupPieces: readonly MatchPiece[];
  readonly title:       string;
}

export interface TicketRowModel {
  readonly ticketId:     string;
  readonly idText:       string;
  readonly titlePieces:  readonly MatchPiece[];
  /** Normal is unmarked. */
  readonly priority:     'low' | 'high' | null;
  /** `null` for a ticket in no group. */
  readonly integration:  TicketIntegrationModel | null;
  /** The ids it waits on, without their `#`. */
  readonly waitingOn:    readonly string[];
  readonly epics:        readonly TicketsEpicDocument[];
  readonly ticketType:   TicketType;
  readonly stateToken:   DisplayState;
  readonly stateLabel:   string;
  /** A paused build's "since 11:45 · 1h 51m", `null` for every other state. */
  readonly pauseText:    string | null;
  /** The paused row's note, the pause text's hover; `null` without one. */
  readonly pauseTitle:   string | null;
  readonly branchPieces: readonly MatchPiece[];
  /** The ticket's own chart row and its label, the ticket's own `#id`; `null` while it has no row. */
  readonly task:         { readonly taskId: number; readonly labelText: string } | null;
}

/** A grouped table's head row: the epic's title, roll-up bar, done text and facts line. */
export interface TicketEpicHeadModel {
  readonly epic:        TicketsEpicDocument;
  readonly segments:    readonly EpicRollupSegment[];
  readonly rollupLabel: string;
  readonly doneText:    string;
  readonly facts:       readonly EpicRollupFact[];
}

/** Rows under one epic's head row when grouped; one headless group holds every row when flat. */
export interface TicketRowGroupModel {
  readonly key:       string;
  /** The head row's epic and roll-up; `null` for the group of tickets in none, and for the one flat group. */
  readonly head:      TicketEpicHeadModel | null;
  readonly showsHead: boolean;
  readonly rows:      readonly TicketRowModel[];
}

export interface TicketsViewModel {
  readonly groups:      readonly TicketRowGroupModel[];
  readonly shownCount:  number;
  readonly countText:   string;
  /** What the empty table says was asked, `null` while a row shows or the board has no ticket. */
  readonly emptyText:   string | null;
  readonly narrows:     boolean;
  readonly showsEpics:  boolean;
  readonly statusChips: readonly FilterChip[];
  readonly typeChips:   readonly FilterChip[];
  readonly epicChips:   readonly FilterChip[];
  readonly countByChip: { readonly status: ReadonlyMap<string, number>; readonly type: ReadonlyMap<string, number>; readonly epic: ReadonlyMap<string, number> };
  /** The view with every pressed epic chip the board no longer knows dropped. */
  readonly view:        TicketView;
}

function boardTicketsOf(state: TicketsBoardState): TicketsBoardTicket[] {
  const { boardFacts, progress } = state.page.payload;
  const factsById = new Map(boardFacts.tickets.map((facts) => [facts.ticketId, facts]));
  const epicByKey = new Map(boardFacts.epics.map((epic) => [epic.key, epic]));
  return state.page.tickets.map((document) => {
    const facts = factsById.get(document.id);
    const ownRow = facts?.ownRowPosition === null || facts?.ownRowPosition === undefined ? undefined : progress.tasks[facts.ownRowPosition];
    const memberOfEpics = (document.epics ?? []).flatMap((key) => {
      const epic = epicByKey.get(key);
      return epic === undefined ? [] : [epic];
    });
    const epicWords = memberOfEpics.flatMap((epic) => [epic.key, epic.title]);
    return {
      document,
      displayState:   facts?.displayState ?? document.status,
      reviewRound:    ownRow?.reviewRound ?? FIRST_REPEAT_REVIEW_ROUND,
      ownRow:         ownRow ?? null,
      waitingOn:      facts?.waitingOnTicketIds ?? [],
      memberOfEpics,
      searchableText: [document.title, ...epicWords, document.branch ?? '', document.group ?? '', HtmlTextUtil.plainTextOf(document.bodyHtml)].join('\n').toLowerCase(),
    };
  });
}

function queryNamesATicketId(query: string): boolean {
  return TICKET_ID_QUERY_PATTERN.test(query);
}

function searchMatches(ticket: TicketsBoardTicket, query: string): boolean {
  if (query === '') return true;
  if (queryNamesATicketId(query)) return ticket.document.id.includes(query.replace(/^#/, ''));
  return ticket.searchableText.includes(query);
}

function statusChipOf(state: DisplayState): TicketStatusChip {
  return state === 're-review' ? 'reviewing' : state;
}

function epicChipsOf(ticket: TicketsBoardTicket): readonly string[] {
  return ticket.memberOfEpics.length === 0 ? [NO_EPIC_CHIP] : ticket.memberOfEpics.map((epic) => epic.key);
}

function viewNarrows(view: TicketView): boolean {
  return SearchMatchUtil.normalisedQueryOf(view.searchText) !== '' || view.statusChips.length > 0 || view.typeChips.length > 0 || view.epicChips.length > 0;
}

interface TicketChipFilters {
  readonly status: ChipFilter<TicketsBoardTicket, TicketStatusChip>;
  readonly type:   ChipFilter<TicketsBoardTicket, TicketType>;
  readonly epic:   ChipFilter<TicketsBoardTicket>;
  readonly all:    ReadonlyArray<ChipFilter<TicketsBoardTicket>>;
}

function ticketChipFiltersOf(view: TicketView): TicketChipFilters {
  const status: ChipFilter<TicketsBoardTicket, TicketStatusChip> = { pressed: view.statusChips, chipsOf: (ticket) => [statusChipOf(ticket.displayState)] };
  const type: ChipFilter<TicketsBoardTicket, TicketType>         = { pressed: view.typeChips, chipsOf: (ticket) => [ticket.document.type] };
  const epic: ChipFilter<TicketsBoardTicket>                     = { pressed: view.epicChips, chipsOf: epicChipsOf };
  return {
    status, type, epic, all: [status, type, epic]
  };
}

function sortValueOf(ticket: TicketsBoardTicket, sortKey: TicketSortKey): number | string {
  const { document } = ticket;
  switch (sortKey) {
    case 'id':     return Number(document.id);
    case 'title':  return document.title.toLowerCase();
    case 'type':   return document.type;
    case 'status': return LIFECYCLE_ORDER.indexOf(ticket.displayState);
    case 'epic':   return ticket.memberOfEpics[0]?.title.toLowerCase() ?? LAST_IN_ORDER;
    case 'branch': return document.branch === undefined || document.branch === '' ? LAST_IN_ORDER : document.branch.toLowerCase();
    default:       return 0;
  }
}

/** Ties fall back to the newest ticket first, whichever column is sorted. */
function ticketComparatorFor(view: TicketView): (a: TicketsBoardTicket, b: TicketsBoardTicket) => number {
  return (a, b) => {
    const first  = sortValueOf(a, view.sortKey);
    const second = sortValueOf(b, view.sortKey);
    if (first === second) return Number(b.document.id) - Number(a.document.id);
    if (first === LAST_IN_ORDER || second === LAST_IN_ORDER) return first === LAST_IN_ORDER ? 1 : -1;
    const order = first < second ? -1 : 1;
    return view.sortDirection === 'ascending' ? order : -order;
  };
}

/** A second press on the sorted column reverses it; a new column starts ascending, except the id, which starts newest first. */
function viewSortedBy(view: TicketView, sortKey: TicketSortKey): TicketView {
  if (view.sortKey === sortKey) return { ...view, sortDirection: view.sortDirection === 'ascending' ? 'descending' : 'ascending' };
  return { ...view, sortKey, sortDirection: sortKey === 'id' ? 'descending' : 'ascending' };
}

function viewCleared(view: TicketView): TicketView {
  return {
    ...view, searchText: '', statusChips: [], typeChips: [], epicChips: []
  };
}

/** What the table's rows measure against: the finished-work window's cutoff and the board's moment. */
export interface TicketsModelMoment {
  readonly cutoffEpochMilliseconds: number;
  readonly nowEpochMilliseconds:    number;
}

/** The newest `paused` phase counts, since a build paused, resumed and paused again counts from its last pause. */
function pauseTextOf(row: TicketsTaskDocument | null, nowEpochMilliseconds: number, state: TicketsBoardState): string | null {
  const pausedAt = (row?.history ?? []).findLast((phase) => phase.status === 'paused')?.at;
  if (pausedAt === undefined || pausedAt === '') return null;
  const { limits } = state.page.payload;
  const since = `since ${TimeUtil.shortStampText(pausedAt, TimeUtil.calendarDateOf(nowEpochMilliseconds), limits)}`;
  const pausedAtEpochMilliseconds = TimeUtil.epochMillisecondsOf(pausedAt);
  const duration = pausedAtEpochMilliseconds === null ? null : TimeUtil.formatDuration(nowEpochMilliseconds - pausedAtEpochMilliseconds, limits);
  return duration === null ? since : `${since} · ${duration}`;
}

/** Where a grouped ticket lands: its release ticket names the rest of the group, every other member names its release. */
function integrationTitleOf(document: TicketsTicketDocument, group: string, tickets: readonly TicketsTicketDocument[]): string {
  const branch = `${GROUP_BRANCH_PREFIX}${group}`;
  const members = tickets.filter((candidate) => candidate.group === group);
  const releaseTicketId = members.find((candidate) => candidate.releasesGroup === true)?.id ?? null;
  if (releaseTicketId === document.id) {
    return `Releases ${branch} with ${members.filter((member) => member.id !== document.id).map((member) => `#${member.id}`).join(', ')}`;
  }
  return `Lands together on ${branch}${releaseTicketId === null ? ', no release ticket yet' : `, released with #${releaseTicketId}`}`;
}

function rowOf(ticket: TicketsBoardTicket, markedQuery: string, state: TicketsBoardState, nowEpochMilliseconds: number): TicketRowModel {
  const { document } = ticket;
  const priority = document.priority ?? 'normal';
  const pauseText = ticket.displayState === 'paused' ? pauseTextOf(ticket.ownRow, nowEpochMilliseconds, state) : null;
  const rowNote = ticket.ownRow?.note ?? '';
  return {
    ticketId:    document.id,
    idText:      `#${document.id}`,
    titlePieces: SearchMatchUtil.matchPiecesOf(document.title, markedQuery),
    priority:    priority === 'normal' ? null : priority,
    integration: document.group === undefined || document.group === ''
      ? null
      : { groupPieces: SearchMatchUtil.matchPiecesOf(document.group, markedQuery), title: integrationTitleOf(document, document.group, state.page.tickets) },
    waitingOn:    ticket.waitingOn,
    epics:        ticket.memberOfEpics,
    ticketType:   document.type,
    stateToken:   ticket.displayState,
    stateLabel:   DisplayStateWordingUtil.stateLabelOf(ticket.displayState, ticket.reviewRound),
    pauseText,
    pauseTitle:   pauseText === null || rowNote === '' ? null : rowNote,
    branchPieces: SearchMatchUtil.matchPiecesOf(document.branch ?? '', markedQuery),
    task:         document.task === null ? null : { taskId: document.task, labelText: `#${document.id}` },
  };
}

function quoted(text: string): string {
  return `“${text}”`;
}

function activeFiltersPhrase(view: TicketView, epicLabelOf: (chip: string) => string): string {
  const parts: string[] = [];
  const query = view.searchText.trim();
  if (query !== '') parts.push(quoted(query));
  if (view.statusChips.length > 0) parts.push(`status ${view.statusChips.map((chip) => DisplayStateWordingUtil.labelOf(chip)).join(' or ')}`);
  if (view.typeChips.length > 0) parts.push(`type ${view.typeChips.join(' or ')}`);
  if (view.epicChips.length > 0) parts.push(`epic ${view.epicChips.map(epicLabelOf).join(' or ')}`);
  return parts.join(', ');
}

function countTextOf(shownCount: number, tickets: readonly TicketsTicketDocument[]): string {
  if (tickets.length === 0) return 'no tickets';
  const inProgressCount = tickets.filter((ticket) => ticket.status === 'in-progress').length;
  const total = `${shownCount} of ${tickets.length} ticket${tickets.length === 1 ? '' : 's'}`;
  return inProgressCount === 0 ? total : `${total} · ${inProgressCount} in progress`;
}

function epicHeadOf(epic: EpicRollupDocument, state: TicketsBoardState, nowEpochMilliseconds: number): TicketEpicHeadModel {
  return {
    epic,
    segments:    EpicRollupUtil.rollupSegmentsOf(epic),
    rollupLabel: EpicRollupUtil.rollupAriaLabelOf(epic),
    doneText:    EpicRollupUtil.doneTextOf(epic),
    facts:       EpicRollupUtil.rollupFactsOf(epic, { limits: state.page.payload.limits, todayCalendarDate: TimeUtil.calendarDateOf(nowEpochMilliseconds), nowEpochMilliseconds }),
  };
}

/** Each epic's shown tickets under its head row, a ticket under its primary epic only, then the tickets in none. */
function groupedRowsOf(shown: readonly TicketsBoardTicket[], rows: readonly TicketRowModel[], state: TicketsBoardState, nowEpochMilliseconds: number): TicketRowGroupModel[] {
  return [...EpicRollupUtil.epicsInShownOrder(state.page.payload.boardFacts.epics), null].flatMap((epic): TicketRowGroupModel[] => {
    const members = rows.filter((_row, index) => (shown[index]?.memberOfEpics[0]?.key ?? null) === (epic?.key ?? null));
    return members.length === 0 ? [] : [{
      key: epic?.key ?? NO_EPIC_CHIP, head: epic === null ? null : epicHeadOf(epic, state, nowEpochMilliseconds), showsHead: true, rows: members
    }];
  });
}

/** Unfinished work always shows, and so does finished work that cannot be dated; the cutoff comparison is a clock exception deciding only what shows. */
function ticketIsInWindow(ticket: TicketsBoardTicket, cutoffEpochMilliseconds: number): boolean {
  const finishedEpochMilliseconds = FinishedWorkUtil.ticketFinishedEpochMillisecondsOf(ticket.document);
  return finishedEpochMilliseconds === null || finishedEpochMilliseconds >= cutoffEpochMilliseconds;
}

function ticketsModelOf(state: TicketsBoardState, requestedView: TicketView, groupedByEpic: boolean, moment: TicketsModelMoment): TicketsViewModel {
  const tickets    = boardTicketsOf(state);
  const { epics }  = state.page.payload.boardFacts;
  const showsEpics = epics.length > 0;
  const view: TicketView = {
    ...requestedView,
    epicChips: ChipFilterUtil.knownPressedChips(requestedView.epicChips, new Set(showsEpics ? [...epics.map((epic) => epic.key), NO_EPIC_CHIP] : [])),
  };
  const narrows     = viewNarrows(view);
  const query       = SearchMatchUtil.normalisedQueryOf(view.searchText);
  const matches     = (ticket: TicketsBoardTicket): boolean => searchMatches(ticket, query);
  const filters     = ticketChipFiltersOf(view);
  const candidates  = narrows ? tickets : tickets.filter((ticket) => ticketIsInWindow(ticket, moment.cutoffEpochMilliseconds));
  const shown       = candidates.filter((ticket) => ChipFilterUtil.itemMatches(ticket, matches, filters.all)).toSorted(ticketComparatorFor(view));
  // An id query marks nothing: the digits it looks for are the whole id column's.
  const markedQuery = queryNamesATicketId(query) ? '' : query;
  const rows        = shown.map((ticket) => rowOf(ticket, markedQuery, state, moment.nowEpochMilliseconds));
  const epicTitleByKey = new Map(epics.map((epic) => [epic.key, epic.title]));
  const epicLabelOf = (chip: string): string => epicTitleByKey.get(chip) ?? chip;
  const flatGroup: TicketRowGroupModel = {
    key: 'all', head: null, showsHead: false, rows
  };
  return {
    groups:      groupedByEpic && showsEpics ? groupedRowsOf(shown, rows, state, moment.nowEpochMilliseconds) : [flatGroup],
    shownCount:  shown.length,
    countText:   countTextOf(shown.length, state.page.tickets),
    emptyText:   tickets.length === 0 || shown.length > 0 ? null : `No ticket matches ${narrows ? activeFiltersPhrase(view, epicLabelOf) : 'the view'}.`,
    narrows,
    showsEpics,
    statusChips: TICKET_STATUS_CHIPS.map((chip) => ({ value: chip, label: DisplayStateWordingUtil.labelOf(chip), stateToken: chip })),
    typeChips:   TICKET_TYPE_CHIPS.map((type) => ({ value: type, label: type })),
    epicChips:   showsEpics
      ? [
        ...EpicRollupUtil.epicsInShownOrder(epics).map((epic): FilterChip => ({ value: epic.key, label: epic.title, slot: epic.slot })),
        { value: NO_EPIC_CHIP, label: NO_EPIC_CHIP },
      ]
      : [],
    countByChip: {
      status: ChipFilterUtil.chipCountsOf(tickets, matches, filters.all, filters.status, TICKET_STATUS_CHIPS),
      type:   ChipFilterUtil.chipCountsOf(tickets, matches, filters.all, filters.type, TICKET_TYPE_CHIPS),
      epic:   ChipFilterUtil.chipCountsOf(tickets, matches, filters.all, filters.epic),
    },
    view,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The state document as the Tickets view reads it, or `null` while it lacks the page payload. */
function ticketsBoardStateOf(document: unknown): TicketsBoardState | null {
  if (!isRecord(document) || !isRecord(document['page'])) return null;
  const { page } = document;
  if (!Array.isArray(page['tickets']) || !isRecord(page['payload'])) return null;
  const { payload } = page;
  if (!isRecord(payload['boardFacts']) || !isRecord(payload['progress']) || !isRecord(payload['limits'])) return null;
  return document as unknown as TicketsBoardState;
}

export const TicketsModel = Object.freeze({
  boardTicketsOf,
  ticketsModelOf,
  ticketsBoardStateOf,
  viewSortedBy,
  viewCleared,
});
