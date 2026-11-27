/** A Board for callers that only read: what it would log goes nowhere, and nothing it holds is written. */
import type { Draft }           from './@types/Draft.ts';
import type { Epic }            from './@types/Epic.ts';
import type { LogRecord }       from './@types/LogRecord.ts';
import type { Pipeline }        from './@types/Pipeline.ts';
import type { Ticket }          from './@types/Ticket.ts';
import type { TrackerProgress } from './@types/TrackerProgress.ts';
import { Board }                from './Board.ts';
import { createLogger }         from './Logger.ts';

/**
 * `storedLogRecords` orders the ready tickets by readiness; a caller that reads no ready tickets leaves it out. `pipeline` is for a caller
 * that reads what the stored pipeline decides (merge approval, the forecasts); without it, the Board reads as no pipeline set.
 */
export function readingBoardOf(
  progress: TrackerProgress,
  tickets: Ticket[],
  epics: Epic[],
  drafts: Draft[] = [],
  storedLogRecords: readonly LogRecord[] = [],
  pipeline: Pipeline | null = null,
): Board {
  return new Board({
    progress, tickets, epics, drafts, logger: createLogger(() => undefined), storedLogRecords, pipeline
  });
}
