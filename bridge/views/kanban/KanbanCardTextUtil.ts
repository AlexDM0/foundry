/**
 * The words a Kanban card prints beyond its title: the footer stamp (a working card's time at
 * work, a waiting card's wait, else its newest milestone), the sub-state note and the reviewed mark's hover. The now is handed in;
 * measuring against it is a stated clock exception that decides only the text printed.
 */
import type { DisplayState, TaskPhase }                  from '../../../src/lib/tracker-model/@types/Task.ts';
import { FIRST_REPEAT_REVIEW_ROUND }                     from '../../../src/lib/tracker-model/constants/ReviewRounds.ts';
import type { KanbanTaskDocument, KanbanTicketDocument } from '../../@types/KanbanBoardState.ts';
import { ElapsedTimeUtil }                               from '../../utils/ElapsedTimeUtil.ts';
import type { DurationUnits, TimestampSlices }           from '../../utils/TimeUtil.ts';
import { TimeUtil }                                      from '../../utils/TimeUtil.ts';

/** What a card's texts are measured and cut by. */
export interface KanbanCardTextFormat {
  readonly nowEpochMilliseconds: number;
  readonly todayCalendarDate:    string;
  readonly limits:               TimestampSlices & DurationUnits;
}

/** The ticket, its state and its rows, as far as the texts read them. */
export interface KanbanCardTextSource {
  readonly ticket:       KanbanTicketDocument;
  readonly displayState: DisplayState;
  readonly ownRow:       KanbanTaskDocument | null;
  /** Oldest filed first. */
  readonly reviewRows:   readonly KanbanTaskDocument[];
}

export interface KanbanCardStamp {
  readonly shortText: string;
  /** The hover: the full stamp, or the ticking text itself. */
  readonly fullText:  string;
  /** A working card's time at work, which moves every second while the board is live. */
  readonly ticks:     boolean;
}

/** The word a closing event is stamped with: a delivery reads as its state's label does, so the Kanban never says "delivered". */
const CLOSING_EVENT_WORD = { delivered: 'done', abandoned: 'abandoned' } as const;

/** Indexed by the last digit; a digit past the list takes `th`. */
const ORDINAL_SUFFIX_BY_LAST_DIGIT: readonly string[] = ['th', 'st', 'nd', 'rd'];
const TEEN_ORDINALS = { first: 11, last: 13, modulus: 100 } as const;
const DECIMAL_BASE = 10;

/** `2nd`, `3rd`, `11th`, `21st`. */
function ordinalOf(round: number): string {
  const lastTwoDigits = round % TEEN_ORDINALS.modulus;
  const isTeen = lastTwoDigits >= TEEN_ORDINALS.first && lastTwoDigits <= TEEN_ORDINALS.last;
  const suffix = isTeen ? undefined : ORDINAL_SUFFIX_BY_LAST_DIGIT[round % DECIMAL_BASE];
  return `${round}${suffix ?? 'th'}`;
}

function newestPhaseAt(row: KanbanTaskDocument | null, status: TaskPhase['status']): string | null {
  return (row?.history ?? []).findLast((phase) => phase.status === status)?.at ?? null;
}

/** What a working card's ticking stamp says before its time: the round of a repeat review, "reviewing" or "building". */
function workLabelOf(source: KanbanCardTextSource): string {
  if (source.displayState === 're-review') return `${ordinalOf(source.ownRow?.reviewRound ?? FIRST_REPEAT_REVIEW_ROUND)} round`;
  return source.displayState === 'in-progress' ? 'building' : 'reviewing';
}

/** A build runs from its row's start; a review from its newest review row's, while that row runs. */
function workStartOf(source: KanbanCardTextSource): string | null {
  if (source.displayState === 'in-progress') return source.ownRow?.start ?? null;
  const reviewRow = source.reviewRows.at(-1) ?? null;
  return reviewRow === null || reviewRow.end !== null ? null : reviewRow.start;
}

function tickingStampOf(source: KanbanCardTextSource, format: KanbanCardTextFormat): KanbanCardStamp | null {
  const startEpochMilliseconds = TimeUtil.epochMillisecondsOf(workStartOf(source));
  if (startEpochMilliseconds === null) return null;
  const text = `${workLabelOf(source)} ${ElapsedTimeUtil.formatElapsed(format.nowEpochMilliseconds - startEpochMilliseconds)}`;
  return { shortText: text, fullText: text, ticks: true };
}

/** "paused 1h 51m", its full stamp in the hover; `null` for a stamp missing, unreadable or later than now, which a backfilled `--at` can write. */
function waitingStampOf(label: string, since: string | null | undefined, format: KanbanCardTextFormat): KanbanCardStamp | null {
  const sinceEpochMilliseconds = TimeUtil.epochMillisecondsOf(since);
  const duration = sinceEpochMilliseconds === null ? null : TimeUtil.formatDuration(format.nowEpochMilliseconds - sinceEpochMilliseconds, format.limits);
  if (since === null || since === undefined || duration === null) return null;
  return { shortText: `${label} ${duration}`, fullText: `${label} since ${TimeUtil.fullStampText(since, format.limits)}`, ticks: false };
}

/** What a building, reviewing, paused or awaiting-review card prints instead of a milestone; `null` for any other, or a source missing. */
function workStampOf(source: KanbanCardTextSource, format: KanbanCardTextFormat): KanbanCardStamp | null {
  switch (source.displayState) {
    case 'in-progress':
    case 'reviewing':
    case 're-review':
      return tickingStampOf(source, format);
    case 'paused':
      return waitingStampOf('paused', newestPhaseAt(source.ownRow, 'paused'), format);
    case 'in-review':
      return waitingStampOf('waiting', newestPhaseAt(source.ownRow, 'in-review') ?? source.ticket.finished ?? source.ownRow?.end, format);
    default:
      return null;
  }
}

/** The newest of the ticket's closing, finishing, starting and filing stamps, labelled; the merge queue calls a finished build "built". */
function latestMilestoneStampOf(ticket: KanbanTicketDocument, format: KanbanCardTextFormat, finishedLabel: string): KanbanCardStamp | null {
  const milestones: readonly (readonly [label: string, stamp: string | null | undefined])[] = [
    [CLOSING_EVENT_WORD.delivered, ticket.delivered],
    [CLOSING_EVENT_WORD.abandoned, ticket.abandonedAt],
    [finishedLabel, ticket.finished],
    ['started', ticket.started],
    ['filed', ticket.filed],
  ];
  const newest = milestones.find(([, stamp]) => typeof stamp === 'string' && stamp !== '');
  if (newest === undefined) return null;
  const [label, stamp] = newest;
  const shownStamp = stamp ?? '';
  return {
    shortText: `${label} ${TimeUtil.shortStampText(shownStamp, format.todayCalendarDate, format.limits)}`,
    fullText:  `${label} ${TimeUtil.fullStampText(shownStamp, format.limits)}`,
    ticks:     false,
  };
}

function cardStampOf(source: KanbanCardTextSource, format: KanbanCardTextFormat, isInMergeQueue: boolean): KanbanCardStamp | null {
  return workStampOf(source, format) ?? latestMilestoneStampOf(source.ticket, format, isInMergeQueue ? 'built' : 'finished');
}

/** What the lane and the stamp cannot say on their own: when a reviewed ticket was reviewed, why an abandoned one was abandoned. */
function cardNoteOf(source: KanbanCardTextSource, format: KanbanCardTextFormat): string | null {
  if (source.displayState === 'reviewed') {
    const reviewed = source.ownRow?.reviewed;
    return reviewed === undefined || reviewed === '' ? null : `reviewed ${TimeUtil.shortStampText(reviewed, format.todayCalendarDate, format.limits)}`;
  }
  if (source.displayState === 'abandoned') return source.ticket.reason === undefined || source.ticket.reason === '' ? null : source.ticket.reason;
  return null;
}

function reviewedTitleOf(ownRow: Pick<KanbanTaskDocument, 'reviewed'>, format: KanbanCardTextFormat): string {
  return ownRow.reviewed === undefined ? 'Reviewed before it was done' : `Reviewed ${TimeUtil.fullStampText(ownRow.reviewed, format.limits)} before it was done`;
}

export const KanbanCardTextUtil = Object.freeze({ cardStampOf, cardNoteOf, reviewedTitleOf });
