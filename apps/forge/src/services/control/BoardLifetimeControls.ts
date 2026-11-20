/**
 * The board's lifetime kinds of the control contract: the default chart axis `range` stores, and `clear`. A relative bound is stored as
 * written and resolved at layout time, so `-2h` keeps meaning "the last two hours"; `bridge/utils/GeometryUtil.ts` resolves each end, which
 * is what makes a mixed pair legal.
 */
import { LocalTimeUtil }                      from '../../lib/local-time/LocalTimeUtil.ts';
import type { JobKind }                       from '../../lib/tracker-model/@types/Job.ts';
import type { LogRecord }                     from '../../lib/tracker-model/@types/LogRecord.ts';
import type { ViewRange }                     from '../../lib/tracker-model/@types/TrackerProgress.ts';
import type { ControlCommandOf as CommandOf } from '../../shared/@types/ControlCommand.ts';
import { OperationRefusal }                   from '../../shared/OperationRefusal.ts';
import type { BoardTransaction }              from '../tracker/BoardTransaction.ts';
import { PictureStore }                       from '../tracker/PictureStore.ts';

export interface TrackerCleared {
  logged:              readonly LogRecord[];
  removedTaskCount:    number;
  removedLogCount:     number;
  /** Counted once the ticket files are gone, after the progress file is written; 0 until then and for `tasks-and-log`. */
  deletedTicketCount:  number;
  deletedEpicCount:    number;
  reseededTicketCount: number;
}

const START_OF_WORK_BOUND_WORD = 'start';

const RELATIVE_BOUND_WORDS = [START_OF_WORK_BOUND_WORD, 'now'];

const RELATIVE_OFFSET_PATTERN = /^[+-]\d+[mhd]$/i;

/** The Assistant has no off switch and works no row, so a live one never holds a clear back. */
const ASSISTANT_JOB_KIND: JobKind = 'assistant';

function boundIsRelative(text: string): boolean {
  return RELATIVE_BOUND_WORDS.includes(text.trim().toLowerCase()) || RELATIVE_OFFSET_PATTERN.test(text.trim());
}

function boundIsStartOfWork(text: string): boolean {
  return text.trim().toLowerCase() === START_OF_WORK_BOUND_WORD;
}

/** An offset is stored as written, but only one that resolves now, so the page is never handed a bound it cannot lay out. */
function storedBoundOf(text: string, now: Date): string | null {
  if (boundIsStartOfWork(text)) return text.trim();
  if (boundIsRelative(text)) return LocalTimeUtil.resolveWhen(text, now) === null ? null : text.trim();
  const parsed = LocalTimeUtil.parseIso(text);
  return parsed === null ? null : LocalTimeUtil.formatLocalIso(parsed);
}

/**
 * A backwards axis draws nothing with no error anywhere. Two timestamps are judged, and so are two bounds relative to now, whose order
 * no clock can change; a mixed pair would be judged by the clock, and `start` is the earliest visible row, known only when the page is drawn.
 */
function rangeIsBackwards(writtenFrom: string, writtenTo: string, now: Date): boolean {
  if (boundIsStartOfWork(writtenFrom) || boundIsStartOfWork(writtenTo)) return false;
  if (boundIsRelative(writtenFrom) !== boundIsRelative(writtenTo)) return false;
  const from = LocalTimeUtil.resolveWhen(writtenFrom, now);
  const to   = LocalTimeUtil.resolveWhen(writtenTo, now);
  return from !== null && to !== null && from.getTime() >= to.getTime();
}

function tickIsWholeMinutes(tickMinutes: number | null): boolean {
  return tickMinutes === null || (Number.isInteger(tickMinutes) && tickMinutes > 0);
}

function viewRangeOf(range: CommandOf<'chart-range-set'>['range'], now: Date): ViewRange {
  if (range.kind === 'automatic') return { kind: 'auto' };
  if (!tickIsWholeMinutes(range.tickMinutes)) throw new OperationRefusal('refused', { kind: 'chart-range-tick-unreadable', tickMinutes: String(range.tickMinutes) });
  const from = storedBoundOf(range.from, now);
  if (from === null) throw new OperationRefusal('refused', { kind: 'chart-range-bound-unreadable', bound: 'from', written: range.from });
  const to = storedBoundOf(range.to, now);
  if (to === null) throw new OperationRefusal('refused', { kind: 'chart-range-bound-unreadable', bound: 'to', written: range.to });
  if (rangeIsBackwards(range.from, range.to, now)) throw new OperationRefusal('refused', { kind: 'chart-range-backwards', from: range.from, to: range.to });
  const bothAreTimestamps = !boundIsRelative(range.from) && !boundIsRelative(range.to);
  return {
    kind: bothAreTimestamps ? 'absolute' : 'relative', from, to, tickMinutes: range.tickMinutes
  };
}

/** A bound relative to now is read against the hold's own time, which the Board stamps the change with. */
function setChartRange(command: CommandOf<'chart-range-set'>, change: BoardTransaction) {
  const view = viewRangeOf(command.range, LocalTimeUtil.parseIso(change.at) ?? new Date(change.at));
  return { view, ...change.board.setChartRange(view, change.at) };
}

/**
 * A live job would run on against rows, a log and, with `everything`, tickets that are gone, so the clear waits until none is live. The
 * Assistant is the exception: it is booted again whenever none is live, and its incidents are kept on the board, not in the log.
 */
function clearTracker(command: CommandOf<'tracker-clear'>, change: BoardTransaction): TrackerCleared {
  const liveJobIds = change.board.jobs().filter((job) => job.kind !== ASSISTANT_JOB_KIND).map((job) => job.id);
  if (liveJobIds.length > 0) throw new OperationRefusal('refused', { kind: 'tracker-has-live-jobs', jobIds: liveJobIds });
  const deletesTickets = command.scope === 'everything';
  const cleared = change.board.clearTracker({ ticketsSurvive: !deletesTickets }, change.at);
  const summary: TrackerCleared = {
    logged:              cleared.logged,
    removedTaskCount:    cleared.removedTaskCount,
    removedLogCount:     change.storedLogEntryCount,
    deletedTicketCount:  0,
    deletedEpicCount:    cleared.removedEpicCount,
    reseededTicketCount: cleared.survivingTicketCount,
  };
  // After the progress file, like every ticket write, so a failed write leaves the tickets, the pictures and the file that names them together.
  if (deletesTickets) {
    change.deleteAllTicketFilesAfterwards((deletedTicketCount) => {
      summary.deletedTicketCount = deletedTicketCount;
      PictureStore.removeAllPictures(change.workspace.trackerDirectory);
    });
  }
  return summary;
}

export const BOARD_LIFETIME_CONTROLS = {
  'chart-range-set': setChartRange,
  'tracker-clear':   clearTracker,
} as const;
