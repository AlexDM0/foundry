/** A pass's hold applying its children's events to the board: questions, closing results, usage refusals and the end of each child. */
import type { UsageWindowObservation }                           from '../../adapters/usage-marker/UsageWindowsFile.ts';
import type { ChildEnd }                                         from '../../domain/talos/ChildRecord.ts';
import type { InterruptionCause, JobKind }                       from '../../domain/tracker-model/@types/Job.ts';
import { FORCED_STOP_REFUSED_INTERRUPTION }                      from '../../domain/tracker-model/constants/JobStates.ts';
import type { AgentAdapter, AgentEndingName }                    from '../../lib/agent-launch/AgentAdapter.ts';
import type { BoardTransaction }                                 from '../tracker/BoardTransaction.ts';
import type { DrivePassRequest }                                 from './@types/DrivePassRequest.ts';
import { AnswerDelivery }                                        from './AnswerDelivery.ts';
import { type ApiBilling, ApiBillingStops, type StoppedSession } from './ApiBillingStops.ts';
import type { BoardChildren }                                    from './BoardChildren.ts';
import { DocumentAgentSessions }                                 from './DocumentAgentSessions.ts';
import { IntakeSessions }                                        from './IntakeSessions.ts';
import { JobResumption }                                         from './JobResumption.ts';
import type { ChildObservation }                                 from './PassObservation.ts';
import { QuestionRouting }                                       from './QuestionRouting.ts';
import { UnreadableJobFileIncident }                             from './UnreadableJobFileIncident.ts';
import { type UsageLimitHit, UsageLimits }                       from './UsageLimits.ts';
import { BUILD_JOB_CAUSES }                                      from './constants/BuildJobCauses.ts';

/** The cause a job is interrupted with when Talos recognised its agent's ending, by the ending's name. */
const INTERRUPTION_CAUSE_OF_AGENT_ENDING: Readonly<Record<AgentEndingName, InterruptionCause>> = { 'network-outage': 'network-outage', };

/** How Talos ended a child that did not end by itself, and the cause its job is interrupted with. */
const INTERRUPTION_CAUSE_OF_TALOS_END: Readonly<Partial<Record<ChildEnd['reason'], InterruptionCause>>> = {
  'paused':      'talos-paused',
  'lease-ended': 'lease-ended',
};

/** Multi-turn sessions: finished only when Hephaestus closed their input, never by a turn's `result`. */
const SESSION_JOB_KINDS: readonly JobKind[] = ['assistant', 'product-owner', 'pipeline-agent', 'document-agent'];

/** The jobs whose session owes a closing report: one that exits cleanly without it ends `failed`, cause `no-report`. */
const REPORTING_JOB_KINDS: readonly JobKind[] = ['build', 'review'];

function lostChildCauseOf(childObservation: ChildObservation): InterruptionCause {
  if (childObservation.lostCause !== null) return childObservation.lostCause;
  return childObservation.forcedStopRefusals.refusals > 0 ? FORCED_STOP_REFUSED_INTERRUPTION : 'talos-lost';
}

interface AppliedChildEvents {
  usageLimitHits:           UsageLimitHit[];
  /** Every usage window the streams reported, in stream order, which the pass records after the hold. */
  usageWindowObservations:  UsageWindowObservation[];
  /** Sessions a refused key or a budget stop ended the work of, which the pass stops after the hold. */
  stoppedSessions:          StoppedSession[];
  /** The pipeline agents whose turn ended in a `result`, whose snapshot Customs checks in the same hold. */
  pipelineAgentTurnEnds:    string[];
  /**
   * The document agents whose turn ended, in a `result`, with their session, or cut short by an interruption, whose snapshot Customs checks
   * before their requests apply, so no request outlives the turn that wrote it.
   */
  documentAgentTurnEnds:    string[];
  /** The stopping document agents whose session ended: each waits or closes only once its turn end's requests were settled. */
  documentAgentSessionEnds: string[];
  /** Each effect reader's `result`, with the report it carried. */
  effectReadingResults:     { jobId: string; report: unknown }[];
  /** The effect readers whose session ended with no `result`. */
  effectReadingEnds:        string[];
}

/** What the child events are read under: the pipeline's API billing, `null` for a subscription, and the decision wording. */
interface ChildEventFacts {
  apiBilling:        ApiBilling | null;
  decisionWordingOf: DrivePassRequest['decisionWordingOf'];
}

/** The cause of the ending Talos recognised in the line at `sequence`; `null` for any other line or an ending this code does not name. */
function recognisedEndingCauseAt(childObservation: ChildObservation, sequence: number): InterruptionCause | null {
  const ending = childObservation.recognisedEndings.find((recognised) => recognised.closingLineSequence === sequence);
  if (ending === undefined || !Object.hasOwn(INTERRUPTION_CAUSE_OF_AGENT_ENDING, ending.name)) return null;
  return INTERRUPTION_CAUSE_OF_AGENT_ENDING[ending.name as AgentEndingName];
}

/**
 * A question opens its decision and a closing result moves the job to verification in the hold that reads them; the cursor moves with them.
 * A top-level usage refusal interrupts the job instead, and the error result after it is no closing result; under API billing so do a 429
 * result, a refused key and a budget stop. A result Talos recognised as an ending interrupts the job with its cause and stops its session.
 */
export function applyChildEvents(
  change: BoardTransaction,
  adapter: AgentAdapter,
  childObservations: readonly ChildObservation[],
  children: BoardChildren,
  trackerDirectory: string,
  facts: ChildEventFacts,
): AppliedChildEvents {
  const { board, at } = change;
  const { apiBilling } = facts;
  const usageLimitHits: UsageLimitHit[] = [];
  const usageWindowObservations: UsageWindowObservation[] = [];
  const stoppedSessions: StoppedSession[] = [];
  const pipelineAgentTurnEnds: string[] = [];
  const documentAgentTurnEnds: string[] = [];
  const documentAgentSessionEnds: string[] = [];
  const effectReadingResults: { jobId: string; report: unknown }[] = [];
  const effectReadingEnds: string[] = [];
  for (const childObservation of childObservations) {
    if (board.jobById(childObservation.jobId)?.childInstance !== childObservation.instance) continue;
    const stateBefore = board.jobById(childObservation.jobId)?.state;
    let closedWithResult = false;
    for (const entry of childObservation.events) {
      if (entry.origin !== 'agent') continue;
      for (const event of adapter.eventsOf(entry.line)) {
        const state = board.jobById(childObservation.jobId)?.state;
        const windowObservation = UsageLimits.windowObservationOf(event, apiBilling !== null);
        if (windowObservation !== null) usageWindowObservations.push(windowObservation);
        const refusal = UsageLimits.refusalOf(event, at, apiBilling !== null);
        if (refusal !== null && state === 'running') {
          const hit = { jobId: childObservation.jobId, ...refusal };
          UsageLimits.interruptLimitedJob(board, hit, at);
          usageLimitHits.push(hit);
          continue;
        }
        const endingCause = event.kind === 'result' && state === 'running' ? recognisedEndingCauseAt(childObservation, entry.sequence) : null;
        if (endingCause !== null) {
          board.interruptJob(childObservation.jobId, endingCause, at);
          stoppedSessions.push({ jobId: childObservation.jobId, childInstance: childObservation.instance });
          continue;
        }
        const failure = event.kind === 'result' ? event.failure : null;
        const stopped = apiBilling === null || failure === null
          ? null
          : ApiBillingStops.applyResultFailure(board, childObservation.jobId, apiBilling, failure, facts.decisionWordingOf, at);
        if (stopped !== null) {
          stoppedSessions.push(stopped);
          closedWithResult = true;
          continue;
        }
        if (event.kind === 'started' && (state === 'launching' || state === 'preparing')) board.moveJob(childObservation.jobId, 'running', at);
        if (event.kind === 'question' && state === 'running') QuestionRouting.openQuestion(board, childObservation.jobId, event.requestId, event.questions, at);
        // A session's turn ends in a `result` too; it finishes only once Hephaestus closed its input.
        const kind = board.jobById(childObservation.jobId)?.kind ?? 'build';
        if (event.kind === 'result' && state === 'running' && kind === 'pipeline-agent') pipelineAgentTurnEnds.push(childObservation.jobId);
        if (event.kind === 'result' && state !== undefined && kind === 'document-agent') documentAgentTurnEnds.push(childObservation.jobId);
        if (event.kind === 'result' && state === 'running' && kind === 'effect-reading') {
          effectReadingResults.push({ jobId: childObservation.jobId, report: event.structuredReport });
          closedWithResult = true;
          continue;
        }
        if (event.kind === 'result' && state === 'running' && !SESSION_JOB_KINDS.includes(kind)) {
          board.moveJob(childObservation.jobId, 'in-customs', at);
          closedWithResult = true;
        }
      }
    }
    const lastEvent = childObservation.events.at(-1);
    // A budget stop ends its job in this loop, which then holds no cursor.
    if (lastEvent !== undefined && board.jobById(childObservation.jobId) !== undefined) {
      board.setJobEventCursor(childObservation.jobId, { instance: childObservation.instance, sequence: lastEvent.sequence });
    }
    const job = board.jobById(childObservation.jobId);
    const state = job?.state;
    const childIsGone = childObservation.liveness.verdict === 'ended' || childObservation.liveness.verdict === 'lost';
    const sessionExitedByItself = childObservation.liveness.verdict === 'ended' && childObservation.liveness.end.reason === 'exited';
    const sessionEndedCleanly   = sessionExitedByItself && childObservation.liveness.verdict === 'ended' && childObservation.liveness.end.exitCode === 0;
    const sessionOwner = job !== undefined && state === 'running'
      ? JobResumption.launchSessionOwnerJobIdOf(children, trackerDirectory, board.logRecordsSoFar(), job, adapter)
      : null;
    if (sessionOwner?.verdict === 'unreadable') UnreadableJobFileIncident.openOnce(board, sessionOwner.unreadableFile, at);
    if (job !== undefined && sessionOwner?.verdict === 'answered' && JobResumption.resumeFailed(
      job,
      sessionOwner.sessionOwnerJobId,
      sessionExitedByItself,
      childObservation.sessionStarted,
    )) {
      JobResumption.applyResumeFailure(board, job, at);
    } else if (childIsGone && !closedWithResult && job?.kind === 'effect-reading') {
      effectReadingEnds.push(job.id);
    } else if (childIsGone && state === 'stopping' && job !== undefined && DocumentAgentSessions.isDocumentAgentJob(job)) {
      // Its turn ended with its session, stopped by User or closed while idle: it waits for its next message with no session.
      documentAgentTurnEnds.push(job.id);
      documentAgentSessionEnds.push(job.id);
    } else if (childIsGone && state === 'stopping' && job !== undefined && SESSION_JOB_KINDS.includes(job.kind) && !IntakeSessions.isIntakeJob(job)) {
      // An Assistant or pipeline agent ends `closed`, so User's next message opens a pipeline agent again with its conversation.
      board.endJob(childObservation.jobId, { outcome: 'closed' }, at);
    } else if (childIsGone && !closedWithResult && state === 'running' && job !== undefined && AnswerDelivery.stoppedForAnswerDelivery(children, job)) {
      board.interruptJob(childObservation.jobId, 'answer-delivery', at);
    } else if (sessionEndedCleanly && !closedWithResult && state === 'running' && job !== undefined && REPORTING_JOB_KINDS.includes(job.kind)) {
      board.endJob(childObservation.jobId, { outcome: 'failed', cause: BUILD_JOB_CAUSES.noReport }, at);
    } else if (childIsGone && !closedWithResult && (state === 'running' || state === 'waiting-for-answer')) {
      // A clean quit or a lease end is Talos's own stop, never a crash the Playbook counts.
      const talosEndCause = childObservation.liveness.verdict === 'ended' ? INTERRUPTION_CAUSE_OF_TALOS_END[childObservation.liveness.end.reason] ?? null : null;
      board.interruptJob(childObservation.jobId, childObservation.liveness.verdict === 'lost' ? lostChildCauseOf(childObservation) : talosEndCause ?? 'agent-crashed', at);
    }
    const interrupted = board.jobById(childObservation.jobId);
    if (interrupted !== undefined && stateBefore !== 'interrupted' && interrupted.state === 'interrupted' && DocumentAgentSessions.isDocumentAgentJob(interrupted)) {
      documentAgentTurnEnds.push(interrupted.id);
    }
  }
  return {
    usageLimitHits, usageWindowObservations, stoppedSessions, pipelineAgentTurnEnds, documentAgentTurnEnds, documentAgentSessionEnds, effectReadingResults, effectReadingEnds
  };
}
