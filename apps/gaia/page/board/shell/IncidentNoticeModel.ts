/**
 * The incident line and its drawer, as a model: one line however many defaults the forge applied since it started (its
 * `incident-defaulted` notices), and a drawer of the open incidents and the applied defaults. Names come from the log, so a record missing
 * from it degrades a sentence, never throws.
 */
import type { BoardQuestionHistoryEntryDocument } from '../../@types/board/BoardDecisionDocuments.ts';
import type { BoardDocument }                     from '../../@types/board/BoardDocument.ts';
import type { BoardNoticeDocument }               from '../../@types/board/BoardFactDocuments.ts';
import { CountTextUtil }                          from '../../shared/utils/CountTextUtil.ts';
import {
  IncidentTrailUtil,
  type IncidentEntry,
  type IncidentPill,
  type IncidentStep
} from '../utils/IncidentTrailUtil.ts';
import { JobStateUtil }                   from '../utils/JobStateUtil.ts';
import { TimeUtil, type TimestampSlices } from '../utils/TimeUtil.ts';

/** How a stamp is shown: sliced by the page's limits against the viewer's day. */
export interface NoticeStampFormat {
  readonly todayCalendarDate: string;
  readonly slices:            TimestampSlices;
}

export interface NoticeStamp {
  readonly shortText: string;
  readonly fullText:  string;
}

export interface IncidentBannerModel {
  /** `4 incident defaults, 2 open incidents.`; the second clause only while an incident is open. */
  readonly leadText: string;
  readonly newest: {
    readonly incidentId: string;
    readonly move:       string;
    /** Empty, and `at` `null`, when the log holds no record of the incident yet. */
    readonly ticketIds:  readonly string[];
    readonly at:         NoticeStamp | null;
  };
}

/** A part of a row's muted meta line: words, or the Assistant job they name, which the drawer links. */
export type IncidentMetaPart =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'job'; readonly jobId: string };

export interface IncidentTrailLine {
  readonly at:    NoticeStamp | null;
  readonly step:  IncidentStep;
  /** The applied default: its dot in the error ink, its words bold. */
  readonly alert: boolean;
}

export interface IncidentRowModel {
  readonly incidentId: string;
  readonly kind:       string;
  readonly ticketIds:  readonly string[];
  readonly jobId:      string | null;
  readonly meta:       readonly IncidentMetaPart[];
  readonly pill:       IncidentPill;
  /** An applied default the viewer has not marked seen. */
  readonly unseen:     boolean;
  readonly trail:      readonly IncidentTrailLine[];
}

/** Each row with its trail. */
export interface IncidentDrawerModel {
  /** `2 open · 4 defaults applied`. */
  readonly summaryText:   string;
  /** Board order: oldest first, as incidents are numbered. */
  readonly openRows:      readonly IncidentRowModel[];
  /** Newest first. */
  readonly defaultedRows: readonly IncidentRowModel[];
}

export interface IncidentNoticeModel {
  /**
   * How many defaults, how many incidents are open, and the newest default, the last notice in log order, never a stamp comparison. `null`
   * while every noticed default is seen: open incidents alone raise none, as they are the Assistant's work.
   */
  readonly banner: IncidentBannerModel | null;
  readonly drawer: IncidentDrawerModel;
}

const INCIDENT_DEFAULTED = 'incident-defaulted';

const ASSISTANT_JOB_KIND = 'assistant';

/** The board fields the incident line reads. */
export type IncidentNoticeBoard = Pick<BoardDocument, 'jobs' | 'incidents' | 'notices' | 'questionHistory'>;

interface DefaultNotice {
  readonly incidentId: string;
  readonly move:       string;
  /** Why the default was taken, as the forge words it; the cause as recorded where it words none. */
  readonly causeText:  string;
}

function textFactOf(notice: BoardNoticeDocument, fact: string): string {
  const value = notice.facts[fact];
  return typeof value === 'string' ? value : '';
}

/** The defaults applied since the forge started, in log order. */
function defaultNoticesOf(board: Pick<IncidentNoticeBoard, 'notices'>): DefaultNotice[] {
  return board.notices
    .filter((notice) => notice.kind === INCIDENT_DEFAULTED && textFactOf(notice, 'incidentId') !== '')
    .map((notice) => ({ incidentId: textFactOf(notice, 'incidentId'), move: textFactOf(notice, 'move'), causeText: notice.causeText ?? textFactOf(notice, 'cause') }));
}

function stampOf(at: string | null, format: NoticeStampFormat | null): NoticeStamp | null {
  if (at === null || at === '' || format === null) return null;
  return { shortText: TimeUtil.shortStampText(at, format.todayCalendarDate, format.slices), fullText: TimeUtil.fullStampText(at, format.slices) };
}

/** A default the log does not hold yet still makes a row: its kind and tickets unknown, settled by its notice's move. */
function entryOfNotice(notice: DefaultNotice): IncidentEntry {
  return {
    incidentId:      notice.incidentId,
    kind:            '',
    ticketIds:       [],
    jobId:           null,
    settlement:      'defaulted',
    defaultMove:     null,
    delivered:       true,
    deliveredInChat: null,
    facts:           [],
    openedAt:        null,
    settledAt:       null,
    settlingMove:    notice.move,
    steps:           [],
  };
}

function trailOf(entry: IncidentEntry, format: NoticeStampFormat | null): IncidentTrailLine[] {
  return entry.steps.map((step) => ({ at: stampOf(step.at, format), step, alert: step.form === 'defaulted' }));
}

/** `opened 22:42 · default gate-retry · with J1, chat 14`, or what it waits for while undelivered. */
function openMetaOf(entry: IncidentEntry, liveAssistantId: string | null, format: NoticeStampFormat | null): IncidentMetaPart[] {
  const opened = stampOf(entry.openedAt, format);
  const parts: IncidentMetaPart[] = [];
  if (opened !== null) parts.push({ kind: 'text', text: `opened ${opened.shortText} · ` });
  if (entry.defaultMove !== null) parts.push({ kind: 'text', text: `default ${entry.defaultMove} · ` });
  if (entry.deliveredInChat !== null) {
    const { jobId, chatSequence } = entry.deliveredInChat;
    parts.push({ kind: 'text', text: 'with ' }, { kind: 'job', jobId }, { kind: 'text', text: `, chat ${String(chatSequence)}` });
  } else if (liveAssistantId === null) {
    parts.push({ kind: 'text', text: 'waits for a fresh Assistant' });
  } else {
    parts.push({ kind: 'text', text: 'waits for ' }, { kind: 'job', jobId: liveAssistantId }, { kind: 'text', text: '\'s next turn' });
  }
  return parts;
}

/** `22:40 · job-fresh: its delivery turn closed`. */
function defaultedMetaOf(entry: IncidentEntry, notice: DefaultNotice, format: NoticeStampFormat | null): IncidentMetaPart[] {
  const settled = stampOf(entry.settledAt, format);
  const moveText = `${notice.move}: ${notice.causeText}`;
  return [{ kind: 'text', text: settled === null ? moveText : `${settled.shortText} · ${moveText}` }];
}

function rowOf(entry: IncidentEntry, meta: IncidentMetaPart[], unseen: boolean, format: NoticeStampFormat | null): IncidentRowModel {
  return {
    incidentId: entry.incidentId,
    kind:       entry.kind,
    ticketIds:  entry.ticketIds,
    jobId:      entry.jobId,
    meta,
    pill:       IncidentTrailUtil.incidentPillOf(entry),
    unseen,
    trail:      trailOf(entry, format),
  };
}

function liveAssistantIdOf(board: Pick<IncidentNoticeBoard, 'jobs'>): string | null {
  return board.jobs.find((job) => job.kind === ASSISTANT_JOB_KIND && JobStateUtil.isUp(job.state))?.id ?? null;
}

function defaultedRecordOf(history: readonly BoardQuestionHistoryEntryDocument[], incidentId: string): BoardQuestionHistoryEntryDocument | undefined {
  return history.findLast((record) => record.kind === INCIDENT_DEFAULTED && record.incidentId === incidentId);
}

interface BannerReading {
  readonly notices:   readonly DefaultNotice[];
  readonly openCount: number;
  readonly settled:   readonly IncidentEntry[];
  readonly history:   readonly BoardQuestionHistoryEntryDocument[];
  readonly format:    NoticeStampFormat | null;
}

function bannerOf({
  notices, openCount, settled, history, format
}: BannerReading): IncidentBannerModel | null {
  const newest = notices.at(-1);
  if (newest === undefined) return null;
  const openClause = openCount === 0 ? '' : `, ${CountTextUtil.countedPhrase(openCount, 'open incident', 'open incidents')}`;
  const entry = settled.find((candidate) => candidate.incidentId === newest.incidentId);
  return {
    leadText: `${CountTextUtil.countedPhrase(notices.length, 'incident default', 'incident defaults')}${openClause}.`,
    newest:   {
      incidentId: newest.incidentId,
      move:       newest.move,
      ticketIds:  entry?.ticketIds ?? [],
      at:         stampOf(defaultedRecordOf(history, newest.incidentId)?.at ?? null, format),
    },
  };
}

function incidentNoticeModelOf(board: IncidentNoticeBoard, seenIncidentIds: readonly string[], format: NoticeStampFormat | null): IncidentNoticeModel {
  const history = board.questionHistory;
  const notices = defaultNoticesOf(board);
  const openEntries = IncidentTrailUtil.openIncidentEntriesOf(board.incidents, history, board.notices);
  const settled = IncidentTrailUtil.settledIncidentEntriesOf(history, new Set(board.incidents.map((incident) => incident.id)), board.notices);
  const seen = new Set(seenIncidentIds);
  const liveAssistantId = liveAssistantIdOf(board);
  const defaultedRows = notices.toReversed().map((notice) => {
    const entry = settled.find((candidate) => candidate.incidentId === notice.incidentId) ?? entryOfNotice(notice);
    return rowOf(entry, defaultedMetaOf(entry, notice, format), !seen.has(notice.incidentId), format);
  });
  return {
    banner: defaultedRows.some((row) => row.unseen) ? bannerOf({
      notices, openCount: openEntries.length, settled, history, format
    }) : null,
    drawer: {
      summaryText: `${String(openEntries.length)} open · ${CountTextUtil.countedPhrase(notices.length, 'default applied', 'defaults applied')}`,
      openRows:    openEntries.map((entry) => rowOf(entry, openMetaOf(entry, liveAssistantId, format), false, format)),
      defaultedRows,
    },
  };
}

/** The ids to store on "Mark defaults seen": exactly the defaults noticed now, so the list never outgrows one forge run. */
function seenIdsAfterMarking(board: Pick<IncidentNoticeBoard, 'notices'>): string[] {
  return defaultNoticesOf(board).map((notice) => notice.incidentId);
}

export const IncidentNoticeModelUtil = Object.freeze({ incidentNoticeModelOf, seenIdsAfterMarking });
