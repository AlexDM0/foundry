/**
 * The parts every form of the detail panel is built from: stamps shortened through `TimeUtil` and never re-parsed, the facts lines, a
 * group's integration worded as where the ticket lands, and the log lines `LogClaimUtil` claims.
 */
import type { BoardDocument }       from '../../../@types/board/BoardDocument.ts';
import type { BoardLimitsDocument } from '../../../@types/board/BoardFactDocuments.ts';
import type {
  BoardEpicDocument,
  BoardLogEntryDocument,
  BoardTaskDocument,
  BoardTicketDocument
} from '../../../@types/board/BoardTicketDocuments.ts';
import type { BoardDisplayState } from '../../../@types/board/BoardVocabulary.ts';
import type { DetailItem }        from '../../shared/routing/DetailRoute.ts';
import { RowLabelUtil }           from '../../utils/RowLabelUtil.ts';
import { TimeUtil }               from '../../utils/TimeUtil.ts';
import { LogClaimUtil }           from './LogClaimUtil.ts';

/** The word a closing event is stamped with: a delivery reads as its state's label does, so the panel never says "delivered". */
export const CLOSING_EVENT_WORD = Object.freeze({ delivered: 'done', abandoned: 'abandoned' } as const);

/** `docs/cli.md`'s bare name for the branch a group's bundle is built on; a namespaced board's sits under its namespace (`src/shared/BranchNames.ts`). */
const GROUP_BRANCH_PREFIX = 'group-';

const HELD_WITHOUT_REASON_TEXT = 'no reason given';

/** What the panel reads the stamps and the time against: the viewer's day and now, both only shown, and the board's limits. */
export interface DetailFormat {
  readonly todayCalendarDate:    string;
  readonly nowEpochMilliseconds: number;
  readonly limits:               BoardLimitsDocument;
}

/** A stamp shown short against the viewer's day, in full on hover. */
export interface StampModel {
  readonly shortText: string;
  readonly fullText:  string;
}

/** A link inside the panel: it opens `item` over the tab the panel is on. */
export interface DetailLinkModel {
  readonly text: string;
  readonly item: DetailItem;
}

/**
 * Where a group's ticket lands: `lands-together` on the group branch, released with the release ticket in `links` (none yet when empty),
 * or, on the release ticket itself, `releases` the branch with the other members in `links`. Each fact layout words it.
 */
export interface IntegrationModel {
  readonly branch:   string;
  readonly relation: 'lands-together' | 'releases';
  readonly links:    readonly DetailLinkModel[];
}

/** Each fact may carry a second line, which only the grid layout shows; `figure` sets a text fact's value in the mono face there. */
export type DetailFactModel =
  | { readonly kind: 'text'; readonly label: string; readonly text: string; readonly title?: string; readonly figure?: true; readonly secondaryText?: string }
  | { readonly kind: 'stamp'; readonly label: string; readonly stamp: StampModel; readonly secondaryText?: string }
  | { readonly kind: 'links'; readonly label: string; readonly links: readonly DetailLinkModel[]; readonly secondaryText?: string }
  | { readonly kind: 'epics'; readonly label: string; readonly epics: readonly BoardEpicDocument[]; readonly secondaryText?: string }
  | { readonly kind: 'integration'; readonly label: string; readonly integration: IntegrationModel; readonly secondaryText?: string };

export interface LogLineModel {
  readonly key:   string;
  readonly stamp: StampModel;
  readonly text:  string;
}

/** Which form a ticket link inside the panel opens: the ticket form from the ticket form, the row form from the row form. */
export type TicketLinkForm = 'ticket' | 'ticket-row';

function stampOf(stamp: string, format: DetailFormat): StampModel {
  return { shortText: TimeUtil.shortStampText(stamp, format.todayCalendarDate, format.limits), fullText: TimeUtil.fullStampText(stamp, format.limits) };
}

function stampFactsOf(stamps: readonly (readonly [string, string | null | undefined])[], format: DetailFormat): DetailFactModel[] {
  return stamps.flatMap(([label, stamp]): DetailFactModel[] => (typeof stamp === 'string' && stamp !== '' ? [{ kind: 'stamp', label, stamp: stampOf(stamp, format) }] : []));
}

function textFactsOf(texts: readonly (readonly [string, string | null | undefined])[]): DetailFactModel[] {
  return texts.flatMap(([label, text]): DetailFactModel[] => (text === undefined || text === null || text === '' ? [] : [{ kind: 'text', label, text }]));
}

function ticketLinksOf(ticketIds: readonly string[], form: TicketLinkForm): DetailLinkModel[] {
  return ticketIds.map((ticketId) => ({ text: `#${ticketId}`, item: { form, ticketId } }));
}

function ticketLinksFactsOf(label: string, ticketIds: readonly string[], form: TicketLinkForm): DetailFactModel[] {
  return ticketIds.length === 0 ? [] : [{ kind: 'links', label, links: ticketLinksOf(ticketIds, form) }];
}

/** The task fact reads the row's label, `#004`, and opens the row form of the ticket's row. */
function taskFactsOf(ticket: BoardTicketDocument): DetailFactModel[] {
  if (ticket.task === null) return [];
  return [{ kind: 'links', label: 'task', links: [{ text: RowLabelUtil.rowLabelOf({ ticket: ticket.id }), item: { form: 'task-row', taskId: ticket.task } }] }];
}

function heldFactsOf(ticket: BoardTicketDocument): DetailFactModel[] {
  return ticket.hold === null ? [] : textFactsOf([['held', ticket.hold === '' ? HELD_WITHOUT_REASON_TEXT : ticket.hold]]);
}

function epicsOf(ticket: BoardTicketDocument, boardEpics: readonly BoardEpicDocument[]): BoardEpicDocument[] {
  return ticket.epics.flatMap((key) => boardEpics.filter((epic) => epic.key === key));
}

function epicFactsOf(ticket: BoardTicketDocument, boardEpics: readonly BoardEpicDocument[]): DetailFactModel[] {
  const epics = epicsOf(ticket, boardEpics);
  return epics.length === 0 ? [] : [{ kind: 'epics', label: 'epics', epics }];
}

/** Only an open marked ticket is the group's release ticket: a closed one's mark is history, so the group then has none. */
function integrationOf(ticket: BoardTicketDocument, allTickets: readonly BoardTicketDocument[], form: TicketLinkForm): IntegrationModel | null {
  const { group } = ticket;
  if (group === null || group === '') return null;
  const members = allTickets.filter((candidate) => candidate.group === group);
  const releaseTicket = members.find((candidate) => candidate.releasesGroup && !candidate.facts.isClosed);
  const branch = `${GROUP_BRANCH_PREFIX}${group}`;
  if (releaseTicket?.id === ticket.id) {
    return { branch, relation: 'releases', links: ticketLinksOf(members.filter((candidate) => candidate.id !== ticket.id).map((candidate) => candidate.id), form) };
  }
  return { branch, relation: 'lands-together', links: releaseTicket === undefined ? [] : ticketLinksOf([releaseTicket.id], form) };
}

function integrationFactsOf(ticket: BoardTicketDocument, allTickets: readonly BoardTicketDocument[], form: TicketLinkForm): DetailFactModel[] {
  const integration = integrationOf(ticket, allTickets, form);
  return integration === null ? [] : [{ kind: 'integration', label: 'integration', integration }];
}

/** The domains a ticket's sessions may reach, last. */
function networkFactsOf(ticket: BoardTicketDocument): DetailFactModel[] {
  return textFactsOf([['network', ticket.network.join(', ')]]);
}

/** The newest `paused` phase, since a build paused, resumed and paused again counts from its last pause. */
function pausedStampOf(row: Pick<BoardTaskDocument, 'history'> | null): string | null {
  const pausedAt = (row?.history ?? []).findLast((phase) => phase.status === 'paused')?.at;
  return pausedAt === undefined || pausedAt === '' ? null : pausedAt;
}

/**
 * A paused build's `since 11:45 · 1h 51m`, the full stamp on hover, then the row's note. Measuring the pause against now is a stated clock
 * exception that decides only the text; the duration is left off when the stamp is later than now, as a backfilled `--at` can be.
 */
function pauseFactsOf(displayState: BoardDisplayState, ownRow: BoardTaskDocument | null, format: DetailFormat): DetailFactModel[] {
  const pausedAt = displayState === 'paused' ? pausedStampOf(ownRow) : null;
  if (pausedAt === null) return [];
  const since = `since ${TimeUtil.shortStampText(pausedAt, format.todayCalendarDate, format.limits)}`;
  const pausedAtEpochMilliseconds = TimeUtil.epochMillisecondsOf(pausedAt);
  const duration = pausedAtEpochMilliseconds === null ? null : TimeUtil.formatDuration(format.nowEpochMilliseconds - pausedAtEpochMilliseconds, format.limits);
  return [
    {
      kind: 'text', label: 'paused', text: duration === null ? since : `${since} · ${duration}`, title: TimeUtil.fullStampText(pausedAt, format.limits)
    },
    ...textFactsOf([['row note', ownRow?.note]]),
  ];
}

function logLinesOf(log: readonly BoardLogEntryDocument[], taskId: number | null, ticketId: string | null, format: DetailFormat): LogLineModel[] {
  // Sorting by stamp is a stated clock exception that decides only the display order, because `--at` backfills.
  // Within one second the later append is the newer line.
  return log
    .map((entry, appendIndex) => ({ entry, appendIndex }))
    .filter(({ entry }) => LogClaimUtil.entryIsAbout(entry, taskId, ticketId))
    .sort((a, b) => b.entry.at.localeCompare(a.entry.at) || b.appendIndex - a.appendIndex)
    .map(({ entry, appendIndex }) => ({ key: String(appendIndex), stamp: stampOf(entry.at, format), text: entry.text }));
}

/** The board's own row of a ticket, its row facts and its review rows, oldest first; each `null` or empty where the board holds none. */
function ticketRowsOf(board: BoardDocument, ticketId: string): {
  readonly ownRow:     BoardTaskDocument | null;
  readonly reviewRows: readonly BoardTaskDocument[];
} {
  const { facts: pageFacts, progress } = board.page;
  const facts = pageFacts.tickets.find((candidate) => candidate.ticketId === ticketId);
  const ownRow = facts?.ownRowPosition === null || facts?.ownRowPosition === undefined ? null : progress.tasks[facts.ownRowPosition] ?? null;
  const reviewRows = (facts?.reviewBarPositions ?? []).flatMap((position) => {
    const row = progress.tasks[position];
    return row === undefined ? [] : [row];
  });
  return { ownRow, reviewRows };
}

export const DetailFactsModel = Object.freeze({
  stampOf,
  stampFactsOf,
  textFactsOf,
  ticketLinksOf,
  ticketLinksFactsOf,
  taskFactsOf,
  heldFactsOf,
  epicFactsOf,
  integrationOf,
  integrationFactsOf,
  networkFactsOf,
  pausedStampOf,
  pauseFactsOf,
  logLinesOf,
  ticketRowsOf,
});
