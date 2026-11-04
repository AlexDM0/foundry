/**
 * A lost Watcher whose child tree refused the forced stop: its job waits interrupted `forced-stop-refused`, never resumed beside a tree that
 * may still run. Each sweep tries the stop once more; a settled stop gives the job its cause, and past the bound the job ends `blocked` with
 * one `forced-stop-refused` decision that names the job and the tree.
 */
import type { InterruptionCause, Job }         from '../../lib/tracker-model/@types/Job.ts';
import type { DecisionDraft, DecisionWording } from '../../lib/tracker-model/@types/PlaybookStep.ts';
import type { Board }                          from '../../lib/tracker-model/Board.ts';
import { FORCED_STOP_REFUSED_INTERRUPTION }    from '../../lib/tracker-model/constants/JobStates.ts';
import { FORCED_STOP_TRIES_BEFORE_BLOCKING }   from '../../shared/constants/OverseerLimits.ts';
import type { ForcedStopRefusals }             from './Regrouping.ts';

/** What a pass observed of one Watcher: the cause its stop settled, `null` while refused or not lost, and the refusals stored beside it. */
export interface LostWatcherFacts {
  jobId:              string;
  instance:           number;
  lostCause:          InterruptionCause | null;
  forcedStopRefusals: ForcedStopRefusals;
}

function waitsOnARefusedStop(job: Readonly<Job>): boolean {
  return job.state === 'interrupted' && job.interruption === FORCED_STOP_REFUSED_INTERRUPTION;
}

/** The jobs a sweep asks the next pass to try the forced stop of again. */
function jobIdsToRetryOf(jobs: readonly Readonly<Job>[]): string[] {
  return jobs.filter(waitsOnARefusedStop).map((job) => job.id);
}

function settle(board: Board, watchers: readonly LostWatcherFacts[], decisionWordingOf: (draft: DecisionDraft) => DecisionWording, at: string): void {
  for (const watcher of watchers) {
    const job = board.jobById(watcher.jobId);
    if (job === undefined || job.watcherInstance !== watcher.instance || !waitsOnARefusedStop(job)) continue;
    if (watcher.lostCause !== null) {
      board.interruptJob(job.id, watcher.lostCause, at);
    } else if (watcher.forcedStopRefusals.refusals >= FORCED_STOP_TRIES_BEFORE_BLOCKING) {
      const draft = { kind: 'forced-stop-refused', ticketIds: [...job.ticketIds], jobId: job.id } as const;
      board.endJob(job.id, { outcome: 'blocked', cause: FORCED_STOP_REFUSED_INTERRUPTION }, at);
      if (board.decisions().some((decision) => decision.kind === draft.kind && decision.jobId === job.id)) continue;
      board.openDecision({
        ...draft, askedBy: 'overseer', requestId: null, questions: decisionWordingOf(draft).questions, context: watcher.forcedStopRefusals.treeProcessIds.join(' ')
      }, at);
    }
  }
}

export const RefusedForcedStops = Object.freeze({ jobIdsToRetryOf, settle });
