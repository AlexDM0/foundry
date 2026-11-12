/** The board's lifetime kinds of the control contract: the default chart axis `range` stores, and `clear`. */
import { LocalTimeUtil }                      from '../../lib/local-time/LocalTimeUtil.ts';
import type { LogRecord }                     from '../../lib/tracker-model/@types/LogRecord.ts';
import type { ControlCommandOf as CommandOf } from '../../shared/@types/ControlCommand.ts';
import { OperationRefusal }                   from '../../shared/OperationRefusal.ts';
import { PictureStore }                       from '../tracker/PictureStore.ts';
import type { TrackerChange }                 from '../tracker/TrackerPipeline.ts';
import { ChartRangeUtil }                     from './utils/ChartRangeUtil.ts';

export interface TrackerCleared {
  logged:              readonly LogRecord[];
  removedTaskCount:    number;
  removedLogCount:     number;
  /** Counted once the ticket files are gone, after the progress file is written; 0 until then and for `tasks-and-log`. */
  deletedTicketCount:  number;
  deletedEpicCount:    number;
  reseededTicketCount: number;
}

/** A bound relative to now is read against the hold's own time, which the Board stamps the change with. */
function setChartRange(command: CommandOf<'chart-range-set'>, change: TrackerChange) {
  const verdict = ChartRangeUtil.viewRangeVerdictOf(command.range, LocalTimeUtil.parseIso(change.at) ?? new Date(change.at));
  if (verdict.verdict === 'refused') throw new OperationRefusal('refused', verdict.detail);
  return { view: verdict.view, ...change.board.setChartRange(verdict.view, change.at) };
}

/** A live job would run on against rows, a log and, with `everything`, tickets that are gone, so the clear waits until none is live. */
function clearTracker(command: CommandOf<'tracker-clear'>, change: TrackerChange): TrackerCleared {
  const liveJobIds = change.board.jobs().map((job) => job.id);
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
