/**
 * The Waves tab as a model, laid out in waves: a Done column of the settled tickets the open ones build on, then one column per wave, every
 * head, band, node and edge placed in pixels on one canvas. The graph is `DependencyGraphUtil`'s and the forecast `WaveForecastUtil`'s;
 * which tickets are ready is the forge's served `readyTickets`, and which settle a dependency its `settlesADependency`, never a rule here.
 */
import type { BoardDocument }                          from '../../../@types/board/BoardDocument.ts';
import type { BoardTicketDocument }                    from '../../../@types/board/BoardTicketDocuments.ts';
import type { BoardDisplayState }                      from '../../../@types/board/BoardVocabulary.ts';
import type { DependencyGraph, DependencyGraphTicket } from '../../@types/DependencyGraph.ts';
import { DependencyGraphUtil }                         from '../../utils/DependencyGraphUtil.ts';
import { DisplayStateWordingUtil }                     from '../../utils/DisplayStateWordingUtil.ts';
import { TimeUtil }                                    from '../../utils/TimeUtil.ts';
import type { ForecastRow, ForecastTicket }            from './WaveForecastUtil.ts';
import { WaveForecastUtil }                            from './WaveForecastUtil.ts';

export const NODE_WIDTH_PIXELS = 214;
export const NODE_HEIGHT_PIXELS = 116;
const NODE_GAP_PIXELS = 18;
const COLUMN_GAP_PIXELS = 44;
const CANVAS_PADDING_PIXELS = 10;
/** Every open wave's head carries its count, its forecast or "No forecast", and its slot meter. */
const COLUMN_HEAD_HEIGHT_PIXELS = 84;
const BAND_OUTSET_PIXELS = 8;
const MINIMUM_EDGE_BEND_PIXELS = 24;
/** From this many waiting nodes on, a node's "N wait" is set in the ink colour. */
const HEAVY_WAIT_COUNT = 5;
const DONE_COLUMN_LABEL = 'Done';

export const EMPTY_WAVES_TEXT = 'No open ticket waits on another.';
/** An open wave's head line where `forecastText` is null. */
export const NO_FORECAST_TEXT = 'No forecast';

/** The ticket's first epic, whose swatch and title end its node. */
export interface DependencyNodeEpic {
  readonly title: string;
  readonly slot:  number;
}

/** A chip in a node's head: Ready only as the forge lists it, Held for a held committed ticket, the state while it is built or reviewed. */
export type DependencyNodeChip =
  | { readonly kind: 'ready' }
  | { readonly kind: 'held'; readonly title: string }
  | { readonly kind: 'state'; readonly displayState: BoardDisplayState; readonly label: string };

export interface DependencyColumnModel {
  readonly key:          string;
  readonly label:        string;
  readonly countText:    string;
  readonly isDone:       boolean;
  readonly isNarrow:     boolean;
  readonly forecastText: string | null;
  /** One flag per board slot, set while a node of the wave would fill it; empty for the Done column. */
  readonly slotsFilled:  readonly boolean[];
  readonly slotsLabel:   string;
  readonly left:         number;
  readonly bandLeft:     number;
  readonly bandWidth:    number;
  readonly bandTop:      number;
  readonly bandHeight:   number;
}

export interface DependencyNodeModel {
  readonly ticketId:     string;
  readonly idLabel:      string;
  readonly title:        string;
  readonly displayState: BoardDisplayState;
  readonly isDone:       boolean;
  readonly isInReview:   boolean;
  readonly isLive:       boolean;
  readonly chips:        readonly DependencyNodeChip[];
  /** Zero draws no "N wait". */
  readonly heldCount:    number;
  readonly heldIsHeavy:  boolean;
  /** Null for a ticket in no epic. */
  readonly primaryEpic:  DependencyNodeEpic | null;
  readonly left:         number;
  readonly top:          number;
}

export interface DependencyEdgeModel {
  readonly fromTicketId: string;
  readonly toTicketId:   string;
  readonly isPace:       boolean;
  readonly isSettled:    boolean;
  readonly path:         string;
}

export interface WavesCanvasModel {
  readonly graph:      DependencyGraph;
  readonly width:      number;
  readonly height:     number;
  readonly columns:    readonly DependencyColumnModel[];
  readonly nodes:      readonly DependencyNodeModel[];
  readonly edges:      readonly DependencyEdgeModel[];
  readonly boardSlots: number;
}

interface PlacedColumn {
  readonly label:    string;
  readonly isDone:   boolean;
  readonly isNarrow: boolean;
  readonly nodeIds:  readonly string[];
}

function columnLeftOf(columnIndex: number): number {
  return CANVAS_PADDING_PIXELS + columnIndex * (NODE_WIDTH_PIXELS + COLUMN_GAP_PIXELS);
}

function nodeTopOf(rowIndex: number): number {
  return COLUMN_HEAD_HEIGHT_PIXELS + rowIndex * (NODE_HEIGHT_PIXELS + NODE_GAP_PIXELS);
}

function boardHasDependencies(board: BoardDocument): boolean {
  return board.page.tickets.some((ticket) => ticket.dependsOn.length > 0);
}

/** The pace-path node first, then by the mean row of its parents already placed, which keeps edges from crossing, then most held first. */
function columnsInRowOrder(graph: DependencyGraph, ticketById: ReadonlyMap<string, BoardTicketDocument>): PlacedColumn[] {
  const rowIndexOfNode = new Map<string, number>();
  const builtOn = new Set(graph.openNodeIds.flatMap((nodeId) => ticketById.get(nodeId)?.dependsOn ?? []));
  const doneNodeIds = graph.settledNodeIds.filter((nodeId) => builtOn.has(nodeId));
  doneNodeIds.forEach((nodeId, rowIndex) => rowIndexOfNode.set(nodeId, rowIndex));
  const parentRowMeanOf = (nodeId: string): number => {
    const parentRows = (ticketById.get(nodeId)?.dependsOn ?? []).flatMap((dependencyId) => rowIndexOfNode.get(dependencyId) ?? []);
    return parentRows.length === 0 ? Number.POSITIVE_INFINITY : parentRows.reduce((sum, row) => sum + row, 0) / parentRows.length;
  };
  const heldCountOf = (nodeId: string): number => graph.heldOfNode.get(nodeId)?.size ?? 0;
  const isOnPacePath = (nodeId: string): number => Number(graph.pacePathNodeIds.includes(nodeId));
  const byParentRows = (a: string, b: string): number => {
    const meanA = parentRowMeanOf(a);
    const meanB = parentRowMeanOf(b);
    return meanA === meanB ? 0 : meanA - meanB;
  };
  const waveColumns = graph.waves.map((wave): PlacedColumn => {
    const nodeIds = wave.nodeIds.toSorted((a, b) => isOnPacePath(b) - isOnPacePath(a) || byParentRows(a, b) || heldCountOf(b) - heldCountOf(a));
    nodeIds.forEach((nodeId, rowIndex) => rowIndexOfNode.set(nodeId, rowIndex));
    return {
      label: wave.label, isDone: false, isNarrow: wave.isNarrow, nodeIds
    };
  });
  const doneColumns: PlacedColumn[] = doneNodeIds.length === 0 ? [] : [{
    label: DONE_COLUMN_LABEL, isDone: true, isNarrow: false, nodeIds: doneNodeIds
  }];
  return [...doneColumns, ...waveColumns];
}

function chipsOf(ticket: BoardTicketDocument, displayState: BoardDisplayState, readyTicketIds: ReadonlySet<string>): DependencyNodeChip[] {
  if (readyTicketIds.has(ticket.id)) return [{ kind: 'ready' }];
  if (ticket.status === 'committed' && ticket.hold !== null) return [{ kind: 'held', title: ticket.hold === '' ? 'Held' : `Held: ${ticket.hold}` }];
  if (ticket.status !== 'in-progress' && ticket.status !== 'in-review') return [];
  return [{ kind: 'state', displayState, label: DisplayStateWordingUtil.labelOf(displayState) }];
}

function doneCountTextOf(doneNodeIds: readonly string[], ticketById: ReadonlyMap<string, BoardTicketDocument>): string {
  const deliveredCount = doneNodeIds.filter((ticketId) => ticketById.get(ticketId)?.status === 'delivered').length;
  const reviewedCount = doneNodeIds.length - deliveredCount;
  return reviewedCount === 0 ? `${deliveredCount} delivered` : `${deliveredCount} delivered · ${reviewedCount} awaiting merge`;
}

/** The rows of `progress.tasks` the forge names as each ticket's own row and review bars, which the forecast reads its history from. */
function forecastTicketsOf(board: BoardDocument): ForecastTicket[] {
  const { tasks } = board.page.progress;
  const pageFactsById = new Map(board.page.facts.tickets.map((facts) => [facts.ticketId, facts]));
  const rowAt = (position: number | null): ForecastRow | null => (position === null ? null : tasks[position] ?? null);
  return board.page.tickets.map((ticket): ForecastTicket => {
    const pageFacts = pageFactsById.get(ticket.id);
    return {
      id:                 ticket.id,
      status:             ticket.status,
      resolvedPriority:   ticket.facts.resolvedPriority,
      size:               ticket.size,
      hold:               ticket.hold,
      dependsOn:          ticket.dependsOn,
      settlesADependency: ticket.facts.settlesADependency,
      ownRow:             rowAt(pageFacts?.ownRowPosition ?? null),
      reviewBars:         (pageFacts?.reviewBarPositions ?? []).flatMap((position) => tasks[position] ?? []),
    };
  });
}

/** "ETA 25m–50m": the wave's p50 to p80 finish from now; asked for only while the Overseer runs, since it is shown, never decides. */
function waveForecastTextOf(board: BoardDocument, graph: DependencyGraph, nowEpochMilliseconds: number): (waveNodeIds: readonly string[]) => string | null {
  const forecastTickets = forecastTicketsOf(board);
  const ticketById = new Map(forecastTickets.map((ticket) => [ticket.id, ticket]));
  const forecastById = WaveForecastUtil.ticketFinishForecastsOf(forecastTickets, {
    concurrencyLimit:  graph.boardSlots,
    pacePathTicketIds: graph.pacePathNodeIds,
    nowEpochMilliseconds,
  });
  const units = board.limits;
  return (waveNodeIds) => {
    const forecast = WaveForecastUtil.waveFinishForecastOf(waveNodeIds, ticketById, forecastById);
    if (forecast === null) return null;
    const p50Text = TimeUtil.formatDuration(forecast.p50FinishEpochMilliseconds - nowEpochMilliseconds, units);
    const p80Text = TimeUtil.formatDuration(forecast.p80FinishEpochMilliseconds - nowEpochMilliseconds, units);
    return p50Text === null || p80Text === null ? null : `ETA ${p50Text}–${p80Text}`;
  };
}

function edgePathOf(from: { left: number; top: number }, to: { left: number; top: number }): string {
  const startX = from.left + NODE_WIDTH_PIXELS;
  const startY = from.top + NODE_HEIGHT_PIXELS / 2;
  const endX = to.left;
  const endY = to.top + NODE_HEIGHT_PIXELS / 2;
  const bend = Math.max(MINIMUM_EDGE_BEND_PIXELS, (endX - startX) / 2);
  return `M${startX} ${startY} C${startX + bend} ${startY} ${endX - bend} ${endY} ${endX} ${endY}`;
}

/** Null on a board where no ticket depends on another; with no column, the view says so in `EMPTY_WAVES_TEXT`. */
function wavesModelOf(board: BoardDocument, nowEpochMilliseconds: number): WavesCanvasModel | null {
  if (!boardHasDependencies(board)) return null;
  const { tickets, facts, progress } = board.page;
  const displayStateById = new Map(facts.tickets.map((ticketFacts) => [ticketFacts.ticketId, ticketFacts.displayState]));
  const graphTickets: DependencyGraphTicket[] = tickets.map((ticket) => ({ ...ticket, memberOfEpics: ticket.epics.map((key) => ({ key })) }));
  const graph = DependencyGraphUtil.dependencyGraphOf(graphTickets, board.concurrency.limit);
  const ticketById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  const readyTicketIds = new Set(facts.readyTickets.filter((ready) => !ready.isHeld).map((ready) => ready.id));
  const forecastOf = progress.overseerSetting === 'running' ? waveForecastTextOf(board, graph, nowEpochMilliseconds) : null;
  const placedColumns = columnsInRowOrder(graph, ticketById);
  const forecastTexts = placedColumns.map((column) => (column.isDone || forecastOf === null ? null : forecastOf(column.nodeIds)));
  const epicByKey = new Map(facts.epics.map((epic) => [epic.key, epic]));
  const primaryEpicOf = (ticket: BoardTicketDocument): DependencyNodeEpic | null => {
    const primaryEpicKey = ticket.epics[0];
    const epic = primaryEpicKey === undefined ? undefined : epicByKey.get(primaryEpicKey);
    return epic === undefined ? null : { title: epic.title, slot: epic.slot };
  };

  const columns = placedColumns.map((column, columnIndex): DependencyColumnModel => {
    const usedSlots = Math.min(column.nodeIds.length, graph.boardSlots);
    return {
      key:          column.isDone ? 'done' : column.label,
      label:        column.label,
      countText:    column.isDone ? doneCountTextOf(column.nodeIds, ticketById) : column.isNarrow ? 'one at a time' : `${column.nodeIds.length} side by side`,
      isDone:       column.isDone,
      isNarrow:     column.isNarrow,
      forecastText: forecastTexts[columnIndex] ?? null,
      slotsFilled:  column.isDone ? [] : Array.from({ length: graph.boardSlots }, (_slot, i) => i < column.nodeIds.length),
      slotsLabel:   `${usedSlots} of ${graph.boardSlots} slots in use`,
      left:         columnLeftOf(columnIndex),
      bandLeft:     columnLeftOf(columnIndex) - BAND_OUTSET_PIXELS,
      bandWidth:    NODE_WIDTH_PIXELS + BAND_OUTSET_PIXELS * 2,
      bandTop:      COLUMN_HEAD_HEIGHT_PIXELS - BAND_OUTSET_PIXELS,
      bandHeight:   column.nodeIds.length * (NODE_HEIGHT_PIXELS + NODE_GAP_PIXELS) - NODE_GAP_PIXELS + BAND_OUTSET_PIXELS * 2,
    };
  });

  const placeOfNode = new Map<string, { columnIndex: number; left: number; top: number }>();
  const nodes = placedColumns.flatMap((column, columnIndex) => column.nodeIds.flatMap((nodeId, rowIndex): DependencyNodeModel[] => {
    const ticket = ticketById.get(nodeId);
    if (ticket === undefined) return [];
    const place = { columnIndex, left: columnLeftOf(columnIndex), top: nodeTopOf(rowIndex) };
    placeOfNode.set(nodeId, place);
    const displayState = displayStateById.get(nodeId) ?? ticket.status;
    const heldCount = column.isDone ? 0 : graph.heldOfNode.get(nodeId)?.size ?? 0;
    return [{
      ticketId:    nodeId,
      idLabel:     `#${nodeId}`,
      title:       ticket.title,
      displayState,
      isDone:      column.isDone,
      isInReview:  ticket.status === 'in-review',
      isLive:      displayState === 'in-progress' || displayState === 'reviewing' || displayState === 're-review',
      chips:       column.isDone ? [] : chipsOf(ticket, displayState, readyTicketIds),
      heldCount,
      heldIsHeavy: heldCount >= HEAVY_WAIT_COUNT,
      primaryEpic: primaryEpicOf(ticket),
      left:        place.left,
      top:         place.top,
    }];
  }));

  const settled = new Set(graph.settledNodeIds);
  const paceEdges = new Set(graph.pacePathNodeIds.slice(1).map((nodeId, i) => `${graph.pacePathNodeIds[i] ?? ''}>${nodeId}`));
  const edges = [...placeOfNode.entries()].flatMap(([dependentId, dependentPlace]) => (
    [...new Set(ticketById.get(dependentId)?.dependsOn ?? [])].flatMap((dependencyId): DependencyEdgeModel[] => {
      const dependencyPlace = placeOfNode.get(dependencyId);
      if (dependencyPlace === undefined || dependencyPlace.columnIndex >= dependentPlace.columnIndex) return [];
      return [{
        fromTicketId: dependencyId,
        toTicketId:   dependentId,
        isPace:       paceEdges.has(`${dependencyId}>${dependentId}`),
        isSettled:    settled.has(dependencyId),
        path:         edgePathOf(dependencyPlace, dependentPlace),
      }];
    })
  ));

  const tallestColumnLength = Math.max(0, ...placedColumns.map((column) => column.nodeIds.length));
  return {
    graph,
    width:      placedColumns.length * NODE_WIDTH_PIXELS + Math.max(0, placedColumns.length - 1) * COLUMN_GAP_PIXELS + CANVAS_PADDING_PIXELS * 2,
    height:     nodeTopOf(tallestColumnLength) - NODE_GAP_PIXELS + CANVAS_PADDING_PIXELS,
    columns,
    nodes,
    edges,
    boardSlots: graph.boardSlots,
  };
}

/** A hovered ticket's lineage: itself, everything it depends on and everything waiting on it. */
function lineageOf(graph: DependencyGraph, ticketId: string): ReadonlySet<string> {
  return new Set([ticketId, ...graph.upstreamOfNode.get(ticketId) ?? [], ...graph.heldOfNode.get(ticketId) ?? []]);
}

export const WavesModel = Object.freeze({ wavesModelOf, lineageOf });
