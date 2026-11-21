/**
 * The Epics view's model, the epic cards read from the served board: each shown epic's done mark, summary, roll-up bar, legend and facts,
 * what it waits on outside itself, its tickets in the board's waves, the epics it frees, and its ticket lines newest first, open epics
 * first. A ticket counts under its primary epic alone, as the dependency model's cross-epic links do. The description stays the rendered
 * string, which only the sandboxed frame shows; the summary is its first paragraph's words as text.
 */
import type { BoardDocument }                                          from '../../../@types/board/BoardDocument.ts';
import type { BoardEpicDocument, BoardTicketDocument }                 from '../../../@types/board/BoardTicketDocuments.ts';
import type { BoardDisplayState }                                      from '../../../@types/board/BoardVocabulary.ts';
import type { DependencyGraph }                                        from '../../@types/DependencyGraph.ts';
import type { EpicMark }                                               from '../../chips/EpicChipUtil.ts';
import { DependencyGraphUtil }                                         from '../../utils/DependencyGraphUtil.ts';
import { DisplayStateWordingUtil }                                     from '../../utils/DisplayStateWordingUtil.ts';
import { EpicRollupUtil, type EpicRollupFact, type EpicRollupSegment } from '../../utils/EpicRollupUtil.ts';
import { FinishedWorkUtil, type FinishedWorkChoice }                   from '../../utils/FinishedWorkUtil.ts';
import { HtmlTextUtil }                                                from '../../utils/HtmlTextUtil.ts';
import { TimeUtil }                                                    from '../../utils/TimeUtil.ts';

/** The work an agent is at now, which pulses wherever it shows: a build or a review running. */
const LIVE_DISPLAY_STATES: readonly BoardDisplayState[] = ['in-progress', 'reviewing', 're-review'];

const DONE_COLUMN_LABEL = 'Done';

export type EpicsBoardDocument = Pick<BoardDocument, 'page' | 'concurrency' | 'limits'>;

export interface EpicTicketLine {
  readonly ticketId:   string;
  readonly title:      string;
  /** The ticket's other epics, its "also in" squares. */
  readonly otherEpics: readonly EpicMark[];
  readonly stateToken: BoardDisplayState;
  readonly stateLabel: string;
  readonly isLive:     boolean;
}

/** A ticket outside the epic that one of its tickets waits on, under that ticket's primary epic. */
export interface EpicWaitsOnChip {
  readonly ticketId: string;
  readonly title:    string;
  readonly epic:     EpicMark;
}

/** An epic waiting on this one, and the tickets of this one it waits on. */
export interface EpicFreesChip {
  readonly epic:    EpicMark;
  readonly viaText: string;
}

export interface EpicWavePill {
  readonly ticketId:     string;
  readonly title:        string;
  readonly displayState: BoardDisplayState;
  readonly isLive:       boolean;
}

export interface EpicWaveColumn {
  readonly label:    string;
  readonly isDone:   boolean;
  readonly isNarrow: boolean;
  readonly pills:    readonly EpicWavePill[];
}

export interface EpicCard {
  readonly key:             string;
  readonly title:           string;
  readonly slot:            number;
  /** "3 of 5 done" while open, "all settled" or "no tickets" once nothing is open. */
  readonly doneText:        string;
  /** The description's first paragraph as text, '' without one. */
  readonly summaryText:     string;
  readonly descriptionHtml: string;
  /** The description says more than its summary, so the card offers the whole of it. */
  readonly saysMore:        boolean;
  readonly segments:        readonly EpicRollupSegment[];
  readonly rollupLabel:     string;
  readonly facts:           readonly EpicRollupFact[];
  readonly waitsOn:         readonly EpicWaitsOnChip[];
  /** Done first, then each wave holding a ticket of this epic. */
  readonly waves:           readonly EpicWaveColumn[];
  readonly frees:           readonly EpicFreesChip[];
  readonly tickets:         readonly EpicTicketLine[];
  readonly isLive:          boolean;
}

export interface EpicsModelResult {
  readonly cards:     readonly EpicCard[];
  /** The one line shown when the finished-work choice hid every epic; `null` while any shows. */
  readonly emptyText: string | null;
}

export interface EpicsWindow {
  readonly choice:                  FinishedWorkChoice;
  readonly cutoffEpochMilliseconds: number;
  readonly nowEpochMilliseconds:    number;
}

interface EpicsBoard {
  readonly ticketById:             ReadonlyMap<string, BoardTicketDocument>;
  readonly displayStateById:       ReadonlyMap<string, BoardDisplayState>;
  readonly epicByKey:              ReadonlyMap<string, BoardEpicDocument>;
  readonly graph:                  DependencyGraph;
  readonly firstRepeatReviewRound: number;
}

function byLowestId(a: string, b: string): number {
  return Number(a) - Number(b) || a.localeCompare(b);
}

function markOf(epic: BoardEpicDocument): EpicMark {
  return { key: epic.key, title: epic.title, slot: epic.slot };
}

/** The ticket's epics the board knows, its primary epic first. */
function memberEpicsOf(ticket: BoardTicketDocument | undefined, board: Pick<EpicsBoard, 'epicByKey'>): BoardEpicDocument[] {
  return (ticket?.epics ?? []).flatMap((key) => board.epicByKey.get(key) ?? []);
}

function primaryEpicOf(ticketId: string, board: EpicsBoard): BoardEpicDocument | null {
  return memberEpicsOf(board.ticketById.get(ticketId), board)[0] ?? null;
}

function displayStateOf(ticketId: string, board: EpicsBoard): BoardDisplayState {
  return board.displayStateById.get(ticketId) ?? board.ticketById.get(ticketId)?.status ?? 'committed';
}

function epicsBoardOf(document: EpicsBoardDocument): EpicsBoard {
  const { tickets, facts } = document.page;
  const epicByKey = new Map(facts.epics.map((epic) => [epic.key, epic]));
  const graphTickets = tickets.map((ticket) => ({ ...ticket, memberOfEpics: memberEpicsOf(ticket, { epicByKey }).map((epic) => ({ key: epic.key })) }));
  return {
    ticketById:             new Map(tickets.map((ticket) => [ticket.id, ticket])),
    displayStateById:       new Map(facts.tickets.map((ticketFacts) => [ticketFacts.ticketId, ticketFacts.displayState])),
    epicByKey,
    graph:                  DependencyGraphUtil.dependencyGraphOf(graphTickets, document.concurrency.limit),
    firstRepeatReviewRound: document.limits.firstRepeatReviewRound,
  };
}

function waitsOnOf(epic: BoardEpicDocument, board: EpicsBoard): EpicWaitsOnChip[] {
  const dependencyTicketIds = [...new Set(board.graph.crossGroupLinks
    .filter((link) => link.dependentGroupKey === epic.key)
    .map((link) => link.dependencyNodeId))].sort(byLowestId);
  return dependencyTicketIds.flatMap((ticketId) => {
    const ticket = board.ticketById.get(ticketId);
    const primaryEpic = primaryEpicOf(ticketId, board);
    return ticket === undefined || primaryEpic === null ? [] : [{ ticketId, title: ticket.title, epic: markOf(primaryEpic) }];
  });
}

/** One chip per waiting epic, in the order its first link appears. */
function freesOf(epic: BoardEpicDocument, board: EpicsBoard): EpicFreesChip[] {
  const waitingByKey = new Map<string, { waitingEpic: BoardEpicDocument; viaTicketIds: Set<string> }>();
  for (const link of board.graph.crossGroupLinks) {
    const waitingEpic = primaryEpicOf(link.dependentNodeId, board);
    if (link.dependencyGroupKey !== epic.key || waitingEpic === null) continue;
    const waiting = waitingByKey.get(waitingEpic.key) ?? { waitingEpic, viaTicketIds: new Set<string>() };
    waiting.viaTicketIds.add(link.dependencyNodeId);
    waitingByKey.set(waitingEpic.key, waiting);
  }
  return [...waitingByKey.values()].map(({ waitingEpic, viaTicketIds }) => ({
    epic:    markOf(waitingEpic),
    viaText: `via ${[...viaTicketIds].sort(byLowestId).map((ticketId) => `#${ticketId}`).join(', ')}`,
  }));
}

/** Done first, then each wave holding a ticket of this epic, narrow as the whole wave is narrow. */
function wavesOf(epic: BoardEpicDocument, board: EpicsBoard): EpicWaveColumn[] {
  const pillsOf = (ticketIds: readonly string[]): EpicWavePill[] => ticketIds
    .filter((ticketId) => primaryEpicOf(ticketId, board)?.key === epic.key)
    .flatMap((ticketId) => {
      const ticket = board.ticketById.get(ticketId);
      if (ticket === undefined) return [];
      const displayState = displayStateOf(ticketId, board);
      return [{
        ticketId, title: ticket.title, displayState, isLive: LIVE_DISPLAY_STATES.includes(displayState)
      }];
    });
  const doneColumn: EpicWaveColumn = {
    label: DONE_COLUMN_LABEL, isDone: true, isNarrow: false, pills: pillsOf(board.graph.settledNodeIds)
  };
  const waveColumns = board.graph.waves.map((wave): EpicWaveColumn => ({
    label: wave.label, isDone: false, isNarrow: wave.isNarrow, pills: pillsOf(wave.nodeIds)
  }));
  return [doneColumn, ...waveColumns].filter((column) => column.pills.length > 0);
}

/** Newest first, each naming the ticket's other epics; a repeat review names the round the forge serves. */
function ticketLinesOf(epic: BoardEpicDocument, board: EpicsBoard): EpicTicketLine[] {
  return epic.ticketIds
    .flatMap((ticketId) => board.ticketById.get(ticketId) ?? [])
    .toSorted((a, b) => Number(b.id) - Number(a.id))
    .map((ticket) => {
      const stateToken = displayStateOf(ticket.id, board);
      return {
        ticketId:   ticket.id,
        title:      ticket.title,
        otherEpics: memberEpicsOf(ticket, board).filter((other) => other.key !== epic.key).map(markOf),
        stateToken,
        stateLabel: DisplayStateWordingUtil.stateLabelOf(stateToken, ticket.facts.reviewRound ?? board.firstRepeatReviewRound),
        isLive:     LIVE_DISPLAY_STATES.includes(stateToken),
      };
    });
}

function cardOf(epic: BoardEpicDocument, document: EpicsBoardDocument, board: EpicsBoard, nowEpochMilliseconds: number): EpicCard {
  const descriptionHtml = document.page.epicDescriptions.find((description) => description.key === epic.key)?.descriptionHtml ?? '';
  const summaryText = HtmlTextUtil.firstParagraphTextOf(descriptionHtml);
  const tickets = ticketLinesOf(epic, board);
  return {
    key:         epic.key,
    title:       epic.title,
    slot:        epic.slot,
    doneText:    EpicRollupUtil.settledDoneTextOf(epic),
    summaryText,
    descriptionHtml,
    saysMore:    HtmlTextUtil.plainTextOf(descriptionHtml) !== summaryText,
    segments:    EpicRollupUtil.rollupSegmentsOf(epic),
    rollupLabel: EpicRollupUtil.rollupAriaLabelOf(epic),
    facts:       EpicRollupUtil.rollupFactsOf(epic, { limits: document.limits, todayCalendarDate: TimeUtil.calendarDateOf(nowEpochMilliseconds), nowEpochMilliseconds }),
    waitsOn:     waitsOnOf(epic, board),
    waves:       wavesOf(epic, board),
    frees:       freesOf(epic, board),
    tickets,
    isLive:      tickets.some((ticket) => ticket.isLive),
  };
}

/** The finished-work choice hides a finished epic's whole card, but a card it shows counts all its tickets, finished ones included. */
function epicsModelOf(document: EpicsBoardDocument, finishedWorkWindow: EpicsWindow): EpicsModelResult {
  const board = epicsBoardOf(document);
  const { epics } = document.page.facts;
  const shown = EpicRollupUtil.epicsInShownOrder(FinishedWorkUtil.shownEpicsOf(epics, document.page.tickets, finishedWorkWindow.cutoffEpochMilliseconds));
  return {
    cards:     shown.map((epic) => cardOf(epic, document, board, finishedWorkWindow.nowEpochMilliseconds)),
    emptyText: shown.length === 0 ? `No epic finished ${FinishedWorkUtil.windowPhraseOf(finishedWorkWindow.choice)}.` : null,
  };
}

export const EpicsModel = Object.freeze({ epicsModelOf });
